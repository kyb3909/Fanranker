import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"

/**
 * 발행 전 품질 검사관 (2026-08-04) — 무검수 자동발행 재개의 관문.
 *
 * 7/30 정지 사유(오타·영문 미번역·무내용)가 "작성자가 자기 글을 심사"해서 못
 * 잡힌 문제였으므로, **작성과 별도의 LLM 호출**이 심사한다. 원칙:
 * - fail-closed: 호출 실패·애매하면 무조건 불통과 → 사람 검수 큐에 남는다
 * - 불통과는 삭제가 아니라 강등 — 검수 화면에서 사유와 함께 사람이 처리
 * - 검사관은 고치지 않는다, 판정만 한다 (수정은 사람 또는 재작성 파이프라인 몫)
 */

export interface QualityVerdict {
  pass: boolean
  reasons: string[]
  /** 기사에 등장하는 선수 한글 표기 — 사전 게이트(미등재 선수명 차단)의 재료 */
  playerNamesKr: string[]
}

const SYSTEM_PROMPT = `너는 한국어 스포츠 기사 발행 전 품질 검사관이다. 기사를 고치지 말고 판정만 하라.

⚠️ 절대 규칙: 네가 아는 축구 지식(누가 어느 팀인지, 어떤 이적이 있었는지)으로 사실을
검증하지 마라. 네 지식은 낡았고 기사가 최신이다. 판정 근거는 **이 기사 텍스트 내부의
정합성**뿐이다.

다음 결함이 하나라도 있으면 불통과(pass=false)이고, reasons 에 짧게 사유를 적는다:
1. 번역 누락 — 영어 문장/구절이 번역 안 된 채 남아 있음 (매체명·선수명·대회명 고유명사는 허용)
2. 심각한 오타·문법 오류 — 독자가 어색함을 느낄 수준 (한두 글자 경미한 것은 통과)
3. 제목-본문 불일치 — 제목의 주장에 대응하는 내용이 본문에 아예 없음 (본문에 있으면 통과 — 사실 여부는 판정 대상 아님)
4. 수치 자체모순 — 본문 안에서 같은 항목이 **같은 단위·통화로** 서로 다른 값 (예: 이적료가 3,600만 유로와 4,500만 유로로 두 번). 유로/달러/파운드처럼 통화가 다르면 환산 차이이므로 모순 아님
5. 무내용 필러 — "자세한 내용은 기사에서 확인" 류 채움말이 본문의 핵심
6. 도박/베팅 사이트 홍보 문구·링크

또한 기사에 등장하는 **선수 이름의 한글 표기**를 전부 player_names_kr 배열에 담아라
(감독·구단명은 제외. 선수가 없으면 빈 배열).

reasons 에는 범주명만 쓰지 말고 근거를 한 줄로 (예: "이적료가 3,600만/4,500만 유로로 상충").

JSON만 출력: {"pass": boolean, "reasons": ["..."], "player_names_kr": ["..."]}`

export async function inspectDraft(title: string, content: unknown): Promise<QualityVerdict> {
  const fail = (reason: string): QualityVerdict => ({
    pass: false,
    reasons: [reason],
    playerNamesKr: [],
  })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fail("검사관 미가동(OPENAI_API_KEY 없음)")

  const body = extractTextFromTipTapJSON(content as TipTapNode).slice(0, 4000)
  if (!body || body.length < 50) return fail("본문이 너무 짧음")

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        // 검사관은 작성(4o-mini)보다 한 급 위 — 하루 ≤5건이라 비용 무시 가능
        model: "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `제목: ${title}\n\n본문:\n${body}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return fail(`검사관 호출 실패(HTTP ${res.status})`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      pass?: boolean
      reasons?: unknown[]
      player_names_kr?: unknown[]
    }
    return {
      pass: parsed.pass === true,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 5) : [],
      playerNamesKr: Array.isArray(parsed.player_names_kr)
        ? parsed.player_names_kr.map(String).slice(0, 20)
        : [],
    }
  } catch {
    return fail("검사관 호출 실패(타임아웃/파싱)")
  }
}

/**
 * 표기 사전 게이트 — 기사 속 선수 한글 표기가 사전에 없으면 자동발행 제외.
 * 환각 음차("기마랑에")·오식별("Luis Hall") 차단. 사전은 검수·교정 학습으로
 * 계속 자라므로 커버리지는 시간이 해결한다. 미등재 = 사람 검수로 강등일 뿐.
 */
export function unknownPlayerNames(
  namesKr: string[],
  dictionary: { preferred_ko: string; hangul_alts: string[] | null }[]
): string[] {
  const known = new Set<string>()
  for (const d of dictionary) {
    known.add(d.preferred_ko.replace(/\s+/g, ""))
    for (const alt of d.hangul_alts ?? []) known.add(alt.replace(/\s+/g, ""))
  }
  return namesKr.filter((n) => {
    const key = n.replace(/\s+/g, "")
    if (known.has(key)) return false
    // 성/이름 부분 표기 허용 — "브루노 기마랑이스" 등재 시 "기마랑이스"도 통과
    for (const k of known) if (k.includes(key) || key.includes(k)) return false
    return true
  })
}
