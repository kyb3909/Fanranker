import "server-only"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsage } from "@/lib/llm/usage-log"

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

const MODEL = "gpt-5.6-luna"

const EXTRACT_PROMPT = `너는 한국 스포츠 뉴스룸의 교열 기록원이다. 봇이 쓴 기사(원본)와 검수자가 고친 최종본(수정본)을 비교해서, **표기 교정**과 **사실 정정**을 분리해 추출한다.

표기 교정 (corrections — 표기 사전에 등록된다):
- player / team / coach / competition: 인명·팀명·대회명 한글 표기 교정
- media: 언론사·기자·매체 표기 교정 (예: "Sky Sports News" → "스카이 스포츠")
- term: 축구 용어·일반 단어의 표기·음차 교정

사실 정정 (factual — 사전에 넣으면 오염되므로 반드시 분리한다):
- **같은 대상의 표기를 다듬은 게 아니라, 다른 대상·다른 값으로 바꾼 것.**
  예: 클럽이 틀림("바르셀로나" → "레알 마드리드"), 금액·날짜·스코어가 틀림, 이적 상태(오피셜/루머)가 틀림.
- kind: club | amount | date | score | status | other

규칙:
1. 원본과 수정본에서 **실제로 바뀐 것만** 추출한다. 바뀌지 않은 것은 포함하지 않는다.
2. 문장 구조 변경·조사 수정은 어느 쪽에도 넣지 않는다 — 제외.
3. wrong 은 원본에 등장한 문자열 그대로, correct 는 수정본의 대응 문자열 그대로.
4. 같은 인물/팀의 음차를 다듬었으면 corrections("주니어"→"주니오르"). 다른 인물/팀/값으로 교체했으면 factual("바르셀로나"→"레알 마드리드"). 애매하면 factual — 사전 오염이 더 위험하다.
5. 검수자_사유가 주어지면 분류의 1차 근거로 삼는다 (사유가 "클럽이 틀림"이면 그 변경은 factual/club).
6. 확실하지 않으면 빼라. 잘못된 규칙 하나가 이후 모든 기사에 전파된다.

출력 (JSON only):
{"corrections":[{"wrong":"...","correct":"...","category":"player|team|coach|competition|media|term","romanized":"원어 표기(아는 경우만)"}],"factual":[{"wrong":"...","correct":"...","kind":"club|amount|date|score|status|other","summary":"무엇이 왜 틀렸는지 한 줄"}]}
없으면 각각 빈 배열.`

interface Correction {
  wrong: string
  correct: string
  category: string
  romanized?: string
}

/** 사실 정정 사례 — 사전에 넣지 않고 audit 에 남긴다 (골든셋 함정 케이스 후보) */
interface FactualCase {
  wrong: string
  correct: string
  kind: string
  summary: string
}

export interface DeskEditLearnResult {
  /** 사전에 반영된 표기 교정 (로그용 요약) */
  learned: string[]
  /** 사실 정정 — 사전 미반영, 호출자가 audit 에 기록 */
  factual: FactualCase[]
  /**
   * 추출이 실제로 완주했는가. false(API 키 없음·OpenAI 실패·diff 없음)면 호출자는
   * 학습 완료 해시를 남기지 말 것 — 밤 cron 의 안전망 재시도가 막힌다.
   */
  ran: boolean
}

const VALID_CATEGORIES = new Set(["player", "team", "coach", "competition", "media", "term"])
const VALID_FACTUAL_KINDS = new Set(["club", "amount", "date", "score", "status", "other"])

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

/**
 * 제목 라벨의 대괄호를 벗긴다 — `[Marca]` → `Marca`.
 *
 * ⚠️ 실제 사고 (2026-08-22 운영자 제보: "제목에 [마르카 이렇게 나오고 ]가 붙어서
 * 나와"). 추출기가 제목 앞머리 라벨을 통째로 집어 `[Marca]` → `[마르카]` 를 사전에
 * 등록했다. 그 항목의 romanized("Marca")가 깨끗한 항목(`마르카`)과 같은 키를
 * 주장하면서, 라벨 교정이 `[${preferred}]` 를 다시 씌워 제목이 `[[마르카]]` 로
 * 나갔다. 사전에 들어갈 것은 **표기 그 자체**지 표기가 놓인 자리가 아니다.
 */
function stripLabelBrackets(s: string): string {
  return s
    .replace(/^\[\s*/, "")
    .replace(/\s*\]$/, "")
    .trim()
}

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
    /** 검수자가 적은 수정 사유 — 표기/사실 분류의 1차 근거 (예: "클럽이 틀림") */
    operatorNote?: string | null
  }
): Promise<DeskEditLearnResult> {
  const empty: DeskEditLearnResult = { learned: [], factual: [], ran: false }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return empty

  const originalText = norm(
    [params.originalTitle, ...tiptapText(params.originalContent)].join("\n")
  )
  const currentText = norm([params.finalTitle, ...tiptapText(params.finalContent)].join("\n"))
  if (!originalText || !currentText || originalText === currentText) return empty

  const note = params.operatorNote?.trim()
  let parsed: { corrections?: Correction[]; factual?: FactualCase[] }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...chatParams(MODEL, { temperature: 0, max_tokens: 800 }),
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              원본: originalText,
              수정본: currentText,
              ...(note ? { 검수자_사유: note } : {}),
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      console.error("[desk-learn] OpenAI HTTP", res.status)
      return empty
    }
    const json = await res.json()
    logUsage("news-learn-corrections", MODEL, json)
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}")
  } catch (e) {
    console.error("[desk-learn] extract failed:", e)
    return empty
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

    // 환각 가드는 원문 그대로여야 통과하므로, 대괄호는 **가드를 지난 뒤** 벗긴다
    const wrongTerm = stripLabelBrackets(wrong)
    const correctTerm = stripLabelBrackets(correct)
    if (!wrongTerm || !correctTerm || wrongTerm === correctTerm) continue
    // 벗기고도 대괄호가 남으면 표기가 아니라 문장 조각이다 — 사전에 넣지 않는다
    if (/[[\]]/.test(wrongTerm) || /[[\]]/.test(correctTerm)) {
      console.warn(`[desk-learn] 대괄호 잔존 차단: "${wrong}" → "${correct}"`)
      continue
    }

    try {
      const result = await upsertCorrection(
        supabase,
        {
          wrong: wrongTerm,
          correct: correctTerm,
          category,
          romanized: romanOk ? stripLabelBrackets(roman) : "",
        },
        params.postId
      )
      if (result !== "known" && result !== "error") {
        learned.push(`[${category}] "${wrongTerm}" → "${correctTerm}" (${result})`)
      }
    } catch (e) {
      console.error("[desk-learn] upsert failed:", e)
    }
  }

  // 사실 정정 — 사전에 넣지 않는다 (디오망데형: "바르셀로나"→"레알 마드리드"를
  // 표기 교정으로 오학습하면 사전이 오염된다). 같은 환각 가드만 통과시켜 반환.
  const factual: FactualCase[] = []
  for (const raw of parsed.factual ?? []) {
    const wrong = String(raw?.wrong ?? "").trim()
    const correct = String(raw?.correct ?? "").trim()
    const kind = String(raw?.kind ?? "").trim()
    if (!wrong || !correct || wrong === correct) continue
    if (!VALID_FACTUAL_KINDS.has(kind)) continue
    if (!originalText.includes(wrong) || !currentText.includes(correct)) continue
    factual.push({
      wrong,
      correct,
      kind,
      summary: String(raw?.summary ?? "")
        .trim()
        .slice(0, 200),
    })
  }

  if (learned.length > 0) console.log("[desk-learn] 학습:", learned.join(" / "))
  if (factual.length > 0)
    console.log(
      "[desk-learn] 사실 정정(사전 미반영):",
      factual.map((f) => `[${f.kind}] "${f.wrong}" → "${f.correct}"`).join(" / ")
    )
  return { learned, factual, ran: true }
}

/**
 * 데스킹 학습 콘텐츠 해시 — news-learn-edits cron·VPS learn-from-edits.js 와 같은
 * 컨벤션 (제목+문단 텍스트 norm → sha1 12자). 수정 화면에서 즉시 학습한 버전을
 * audit 에 이 해시로 남기면 밤 cron 이 같은 버전을 재학습하지 않는다.
 */
export function deskEditTextHash(title: string, content: unknown): string {
  const text = norm([title, ...tiptapText(content)].join("\n"))
  return createHash("sha1").update(text, "utf8").digest("hex").slice(0, 12)
}
