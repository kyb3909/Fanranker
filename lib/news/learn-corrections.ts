import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * 데스킹 학습 — 검수자가 봇 기사를 고쳐서 발행하면, 그 수정에서 **표기 교정**만
 * 뽑아 `news_alias_dictionary` 에 등록한다. 다음 기사부터 자동 반영된다.
 *
 * 여기(발행 라우트)에 두는 이유: 검수 → 발행 → 즉시 학습이 한 흐름이어야
 * "고치면서 가르친다"가 성립한다. 배치 스크립트
 * (data/agents/scripts/learn-from-edits.js)는 놓친 수정을 줍는 안전망으로 남는다.
 *
 * 원칙: LLM 은 저자가 아니라 **추출기**다. 지어낸 표기가 사전에 들어가면 이후 모든
 * 기사에 전파되므로, 원문·수정본에 문자열로 실재하는 것만 통과시킨다.
 */

const MODEL = "gpt-4.1-mini"

const EXTRACT_PROMPT = `너는 한국 스포츠 뉴스룸의 교열 기록원이다. 봇이 쓴 기사(원본)와 검수자가 고친 최종본(수정본)을 비교해서, **표기 교정만** 추출한다.

추출 대상 (category):
- player / team / coach / competition: 인명·팀명·대회명 한글 표기 교정
- media: 언론사·기자·매체 표기 교정 (예: "Sky Sports News" → "스카이 스포츠")
- term: 축구 용어·일반 단어의 표기·음차 교정

규칙:
1. 원본과 수정본에서 **실제로 바뀐 표기만** 추출한다. 바뀌지 않은 것은 포함하지 않는다.
2. 문장 구조 변경·내용 추가/삭제·조사 수정은 표기 교정이 아니다 — 제외.
3. wrong 은 원본에 등장한 문자열 그대로, correct 는 수정본의 대응 문자열 그대로.
4. 확실하지 않으면 빼라. 잘못된 규칙 하나가 이후 모든 기사에 전파된다.

출력 (JSON only):
{"corrections":[{"wrong":"...","correct":"...","category":"player|team|coach|competition|media|term","romanized":"원어 표기(아는 경우만)"}]}
교정이 없으면 {"corrections":[]}`

interface Correction {
  wrong: string
  correct: string
  category: string
  romanized?: string
}

const VALID_CATEGORIES = new Set(["player", "team", "coach", "competition", "media", "term"])

/** TipTap JSON → 문단 텍스트 (이미지·임베드 제외) */
function tiptapText(node: unknown, out: string[] = []): string[] {
  const n = node as { type?: string; text?: string; content?: unknown[] } | null
  if (!n) return out
  if (n.type === "paragraph") {
    const t = (n.content ?? []).map((c) => (c as { text?: string }).text ?? "").join("")
    if (t.trim()) out.push(t.trim())
  }
  for (const c of n.content ?? []) tiptapText(c, out)
  return out
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim()

function slugify(s: string): string {
  const ascii = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (ascii) return ascii
  // 비ASCII(한글) 표기 — 코드포인트로 안정적인 짧은 키 생성
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return h.toString(36)
}

async function upsertCorrection(
  supabase: SupabaseClient,
  c: Correction,
  postId: string
): Promise<"inserted" | "surface_added" | "entry_corrected" | "known" | "error"> {
  const surface = c.wrong.toLowerCase()

  // 1) 올바른 표기가 이미 사전에 있으면 → 잘못된 철자를 surface 로 추가
  const { data: existing } = await supabase
    .from("news_alias_dictionary")
    .select("id, surfaces")
    .eq("preferred_ko", c.correct)
    .limit(1)

  if (existing && existing.length > 0) {
    const row = existing[0] as { id: string; surfaces: string[] | null }
    if ((row.surfaces ?? []).includes(surface)) return "known"
    const { error } = await supabase
      .from("news_alias_dictionary")
      .update({
        surfaces: [...(row.surfaces ?? []), surface],
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    if (error) {
      console.error("[desk-learn] surface 추가 실패:", error)
      return "error"
    }
    return "surface_added"
  }

  // 2) 사전이 틀린 표기를 대표값으로 갖고 있던 경우 → 그 항목 자체를 교정
  const { data: stale } = await supabase
    .from("news_alias_dictionary")
    .select("id, surfaces")
    .eq("preferred_ko", c.wrong)
    .limit(1)

  if (stale && stale.length > 0) {
    const row = stale[0] as { id: string; surfaces: string[] | null }
    const { error } = await supabase
      .from("news_alias_dictionary")
      .update({
        preferred_ko: c.correct,
        surfaces: [...new Set([...(row.surfaces ?? []), surface])],
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
    if (error) {
      console.error("[desk-learn] 대표 표기 교정 실패:", error)
      return "error"
    }
    return "entry_corrected"
  }

  // 3) 신규 등록 (romanized 는 NOT NULL)
  const { error } = await supabase.from("news_alias_dictionary").insert({
    id: `${c.category}_learned_${slugify(c.wrong)}`,
    category: c.category,
    preferred_ko: c.correct,
    romanized: c.romanized || (/^[\x00-\x7F]+$/.test(c.wrong) ? c.wrong : ""),
    surfaces: [surface],
    confidence: 0.9,
    notes: `learned-from-edit post=${postId} at=${new Date().toISOString()}`,
  })
  return error ? "error" : "inserted"
}

/**
 * 검수 수정본에서 표기 교정을 학습한다. 실패해도 절대 throw 하지 않는다
 * (발행은 이미 끝난 뒤 호출되므로, 학습 실패가 발행에 영향을 주면 안 된다).
 *
 * @returns 학습된 규칙 요약 (로그용)
 */
export async function learnFromDeskEdit(
  supabase: SupabaseClient,
  params: {
    postId: string
    originalTitle: string
    originalContent: unknown
    finalTitle: string
    finalContent: unknown
  }
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return []

  const originalText = norm(
    [params.originalTitle, ...tiptapText(params.originalContent)].join("\n")
  )
  const currentText = norm([params.finalTitle, ...tiptapText(params.finalContent)].join("\n"))
  if (!originalText || !currentText || originalText === currentText) return []

  let parsed: { corrections?: Correction[] }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: JSON.stringify({ 원본: originalText, 수정본: currentText }) },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      console.error("[desk-learn] OpenAI HTTP", res.status)
      return []
    }
    const json = await res.json()
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}")
  } catch (e) {
    console.error("[desk-learn] extract failed:", e)
    return []
  }

  const learned: string[] = []
  for (const raw of parsed.corrections ?? []) {
    const wrong = String(raw?.wrong ?? "").trim()
    const correct = String(raw?.correct ?? "").trim()
    const category = String(raw?.category ?? "").trim()
    if (!wrong || !correct || wrong === correct) continue
    if (!VALID_CATEGORIES.has(category)) continue

    // 환각 가드 — 양쪽 텍스트에 실재하는 문자열만 사전에 넣는다
    if (!originalText.includes(wrong) || !currentText.includes(correct)) {
      console.warn(`[desk-learn] 환각 차단: "${wrong}" → "${correct}"`)
      continue
    }
    const roman = String(raw?.romanized ?? "").trim()
    const romanOk = roman && (originalText.includes(roman) || currentText.includes(roman))

    try {
      const result = await upsertCorrection(
        supabase,
        { wrong, correct, category, romanized: romanOk ? roman : "" },
        params.postId
      )
      if (result !== "known" && result !== "error") {
        learned.push(`[${category}] "${wrong}" → "${correct}" (${result})`)
      }
    } catch (e) {
      console.error("[desk-learn] upsert failed:", e)
    }
  }

  if (learned.length > 0) console.log("[desk-learn] 학습:", learned.join(" / "))
  return learned
}
