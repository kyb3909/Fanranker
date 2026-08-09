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
  /**
   * 감독·코치 한글 표기. 선수와 따로 받는 이유는 **등재 category 를 가르기 위해서**다 —
   * 감독을 player 로 등재하는 건 무인 사서를 폐지시킨 바로 그 오염이다.
   * 2026-08-09 실사고: 감독이 추출 대상에서 아예 빠져 있어 'Xabi Alonso → 하비 알론소'
   * (정: 사비)가 3건 발행됐다. 사전에 coach 15건이 정확히 있었는데 읽는 코드가 없었다.
   */
  coachNamesKr: string[]
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
5. 무내용 — 원문에서 옮긴 **사실이 없고 원문을 소개만** 하는 글. "자세한 내용은 기사에서
   확인" 류 채움말이 본문의 핵심이거나, "~에 대한 분석이 포함되어 있습니다 / 논의가
   이루어졌습니다 / 여러 관점이 제시되었습니다"처럼 **기사에 무엇이 실렸는지만 서술**하고
   정작 그 내용(수치·발언·경위)은 없는 경우. 분석·칼럼 원문을 요약하려다 나오는 전형이며,
   저작권상 그런 원문은 애초에 기사로 만들지 않는 것이 방침이다 (2026-08-09)
6. 도박/베팅 사이트 홍보 문구·링크

또한 기사에 등장하는 **인물 이름의 한글 표기**를 기사에 적힌 그대로 추출하라 (구단명·대회명은 제외).
역할에 따라 배열을 나눈다 — 표기 사전이 선수와 감독을 다르게 관리하기 때문이다:
- player_names_kr: 선수 (현역·은퇴 불문)
- coach_names_kr: 감독·수석코치
어느 쪽이든 해당자가 없으면 빈 배열. 역할이 불확실하면 선수로 넣어라.

reasons 에는 범주명만 쓰지 말고 근거를 한 줄로 (예: "이적료가 3,600만/4,500만 유로로 상충").

JSON만 출력: {"pass": boolean, "reasons": ["..."], "player_names_kr": ["..."], "coach_names_kr": ["..."]}`

export async function inspectDraft(title: string, content: unknown): Promise<QualityVerdict> {
  const fail = (reason: string): QualityVerdict => ({
    pass: false,
    reasons: [reason],
    playerNamesKr: [],
    coachNamesKr: [],
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
        // 검사관은 작성(4o-mini)보다 한 급 위 — 하루 ≤5건이라 비용 무시 가능.
        // GPT-5 계열은 temperature 미지원(기본 1만 허용) — 넣으면 400 → fail-closed 전건 반려
        model: "gpt-5.6-terra",
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
      coach_names_kr?: unknown[]
    }
    return {
      pass: parsed.pass === true,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 5) : [],
      playerNamesKr: Array.isArray(parsed.player_names_kr)
        ? parsed.player_names_kr.map(String).slice(0, 20)
        : [],
      coachNamesKr: Array.isArray(parsed.coach_names_kr)
        ? parsed.coach_names_kr.map(String).slice(0, 10)
        : [],
    }
  } catch {
    return fail("검사관 호출 실패(타임아웃/파싱)")
  }
}

/**
 * 이미지 적합성 검사 (2026-08-04 실사고: Substack '구독하세요' 배너가 대표
 * 이미지로 발행됨) — 축구 보도 사진인지 vision 으로 심사. fail-closed.
 *
 * `infra=true` 는 **판정이 아니라 검사 실패**다 (원본 접근 차단·타임아웃·키 부재).
 * 2026-08-06 오반려율 실측: 이미지 반려 7건 중 5건이 가디언 계열의 HTTP 400 —
 * 검사관이 이미지를 보지도 못했는데 "부적합" 낙인이 찍혀 기사가 만료로 죽었다.
 * 호출부는 infra 실패를 부적합과 절대 같은 결과로 취급하면 안 된다.
 */
export interface ImageVerdict {
  pass: boolean
  reason: string
  /** true = 검사 자체가 불가했음(판정 없음). 재시도·우회 대상이지 반려 사유가 아니다 */
  infra?: boolean
}

export async function inspectImage(imageUrl: string): Promise<ImageVerdict> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { pass: false, reason: "검사관 미가동", infra: true }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `축구 뉴스 기사의 대표 이미지로 적절한지 판정하라.
적절: 선수·감독·경기·경기장·구단 발표 사진, 유니폼 공개 등 실제 보도 사진
부적절: 로고만 있는 카드, 뉴스레터/구독 배너, 광고, 스크린샷, 순수 텍스트 이미지, 무관한 사진
JSON만: {"pass": boolean, "reason": "한 줄"}`,
          },
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: imageUrl, detail: "low" } }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      return { pass: false, reason: `이미지 검사 실패(HTTP ${res.status})`, infra: true }
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      pass?: boolean
      reason?: string
    }
    return { pass: parsed.pass === true, reason: String(parsed.reason ?? "").slice(0, 100) }
  } catch {
    return { pass: false, reason: "이미지 검사 실패(타임아웃)", infra: true }
  }
}

/** 개인 블로그·뉴스레터 플랫폼 — 보도 매체가 아니므로 자동발행 금지 (사람 검수) */
export const PERSONAL_BLOG_RE =
  /substack\.com|medium\.com|blogspot\.|wordpress\.com|tistory\.com|note\.com|ghost\.io|beehiiv\.com/i

/**
 * 여자 축구 — 서비스 커버리지 밖 (운영자 확정 2026-08-04 "여자 축구 뉴스는 완전 제외",
 * 2026-08-05 재확인 "전혀 수요 없어"). 제목·요약 키워드 기반 기계 가드 —
 * LLM 판단에 맡기지 않는다 (기계 가드 우선 원칙).
 * 대회명(WSL·NWSL·UWCL)·리그 표기·성별 표기(영/한/독/서) 커버.
 *
 * ⚠️ `위민`·`우먼`은 **앞 글자가 한글이면 안 잡는다.** 한국어에는 띄어쓰기 외에 낱말
 * 경계가 없어서 통짜로 잡으면 음차된 사람 이름을 그대로 문다 — 2026-08-05 실사고:
 * 아스날 유망주 Max Dowman("맥스 **도우먼**")이 들어간 BBC 남자 프리미어리그 기사가
 * `우먼` 하나로 통째로 반려됐다. "아스날 위민"처럼 실제 여자팀 표기는 앞에 공백이
 * 오므로 이 제한으로 놓치지 않는다. 다른 항목은 그대로 둔다 — 정책을 푸는 게 아니라
 * 남자 기사가 잘못 걸리는 것만 막는 수정이다.
 */
export const WOMENS_FOOTBALL_RE =
  /여자\s*(?:축구|팀|부|대표팀|월드컵|리그|선수|국가대표|프로|클럽)|여성\s*축구|여축|(?<![가-힣])(?:위민|우먼)|women'?s?\b|\bwoman\b|\bWSL\b|\bNWSL\b|\bUWCL\b|frauen|femenin[ao]|féminin/i

export function isWomensFootball(...texts: (string | null | undefined)[]): boolean {
  return WOMENS_FOOTBALL_RE.test(texts.filter(Boolean).join(" "))
}

/**
 * 원문(영어·스페인어 등) 리드 기반 여자축구 판정 (2026-08-09).
 *
 * 왜 따로 필요한가: **한국어 번역에는 성별 단서가 남지 않는다.** 케롤린 실사고에서
 * 원문에 'WSL'이 6회 나오는데 한국어 제목·본문에는 '여자'가 한 글자도 없었다.
 * 그런데 그때 게이트가 검사하던 세 번째 인자(`draft.original.title`)는 스캐너가 아예
 * 보내지 않는 필드라 **항상 null** — 몰리 바트립 사고 후 세운 방어가 한 번도 실행된
 * 적이 없었다. 그래서 원문 자체를 본다.
 *
 * ⚠️ 문자열 존재만으로 차단하면 안 된다. BBC·가디언 페이지는 사이드바에 women's
 * football 링크가 섞여 들어와서, 실측 10건 중 8건이 남자 기사 오탐이었다.
 * 판별자는 **위치와 밀도**다 — 진짜 여자축구는 리드에 단서가 몰리고, 사이드바
 * 노이즈는 뒤쪽에 흩어진다:
 *   케롤린(여자)   리드 WSL 2회        → 차단
 *   웨스트햄(남자) 리드 women 1회      → 통과
 *   남자 8건       리드 0~1회          → 통과
 */
const WOMENS_LEAD_CHARS = 900
/** 여자 리그·대회 — 리드에 있으면 그 자체로 확정 (남자 기사에 나올 이유가 없다) */
const WOMENS_LEAGUE_RE = /\b(?:WSL|NWSL|UWCL|Liga F|Frauen[- ]?Bundesliga|D1 Arkema)\b/gi
/** 성별 표현 — 사이드바에 1회씩 섞이므로 2회 이상일 때만 신호로 본다 */
const WOMENS_WORD_RE =
  /women'?s?\b|\bfemenin[ao]\b|\bfemení\b|\bjugadora\b|\bdavantera\b|\bfrauen\b/gi

export function isWomensFootballSource(sourceText: string | null | undefined): boolean {
  if (!sourceText) return false
  const lead = sourceText.slice(0, WOMENS_LEAD_CHARS)
  if ((lead.match(WOMENS_LEAGUE_RE) ?? []).length > 0) return true
  return (lead.match(WOMENS_WORD_RE) ?? []).length >= 2
}
