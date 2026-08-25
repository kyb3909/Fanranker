import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"
import { chatParams } from "@/lib/llm/openai-params"

/**
 * 발행 전 문지기 (2026-08-04 도입 → 2026-08-25 개편).
 *
 * ## 본문 품질 검사관은 폐지했다 (운영자 확정)
 * 도입 당시 논리는 "작성자가 자기 글을 심사하면 못 잡는다" 였고 그래서 **작성과 별도의
 * LLM** 을 세웠다. 그런데 작성 모델을 gpt-5.6-terra 로 올리면서 검사관도 terra 라
 * **전제가 뒤집혔다** — 자기가 쓴 글을 자기가 검사하게 됐다.
 *
 * 그 판정에 기대는 대신 결정론 가드에 맡긴다: 날짜 검증·이름 검증(스캐너),
 * 표기 사전·중복·개인 블로그·여자 축구(여기 아래), 그리고 이미지 검사관.
 * ⚠️ 이름 **추출**은 살렸다 — 표기 검증 루프(네이버 대조 → 사전 자동 등재)의 재료다.
 *    검사관을 통째로 지웠다면 그 파이프라인이 같이 죽었을 것이다.
 * ⚠️ 이미지 검사관은 남긴다 — 이미지는 작성 모델이 만든 게 아니라 자기검사가 아니다.
 */

/**
 * 기사에서 뽑은 인물 표기.
 *
 * ⚠️ 2026-08-25 운영자 확정으로 **본문 품질 판정(pass/reasons)은 폐지**했다.
 *    작성 모델을 gpt-5.6-terra 로 올렸는데 검사관도 terra 라, 자기가 쓴 글을 자기가
 *    검사하는 모양이 됐다. 그 판정에 기대느니 결정론 가드(날짜·이름·표기·중복)에 맡긴다.
 *    ⚠️ 다만 **이름 추출은 살린다** — 이게 표기 검증 루프(네이버 대조 → 사전 자동 등재)의
 *       재료다. 검사관을 통째로 지웠다면 그 파이프라인이 같이 죽었을 것이다.
 *    ⚠️ 이미지 검사관(inspectImage)은 남긴다 — 이미지는 작성 모델이 만든 게 아니라
 *       자기검사가 아니다.
 */
interface PersonNames {
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

const NAMES_PROMPT = `너는 한국어 스포츠 기사에서 **인물 이름만 뽑아내는** 추출기다.
판정하지 말고, 고치지 말고, 오직 추출만 하라.

기사에 등장하는 **인물 이름의 한글 표기**를 기사에 적힌 그대로 뽑는다 (구단명·대회명은 제외).
역할에 따라 배열을 나눈다 — 표기 사전이 선수와 감독을 다르게 관리하기 때문이다:
- player_names_kr: 선수 (현역·은퇴 불문)
- coach_names_kr: 감독·수석코치
어느 쪽이든 해당자가 없으면 빈 배열. 역할이 불확실하면 선수로 넣어라.
⚠️ 기자·매체 이름은 넣지 마라. 기사에 없는 이름을 만들어 넣지 마라.

JSON만 출력: {"player_names_kr": ["..."], "coach_names_kr": ["..."]}`

/**
 * 도박·베팅 홍보 차단 — **폐지한 검사관이 보던 항목 중 유일하게 대체가 필요했던 것.**
 *
 * 검사관 판정 6번이 "도박/베팅 사이트 홍보 문구·링크"였다. 검사관을 걷어내면서
 * 이것도 같이 사라질 뻔했다 (아키텍처 가드가 잡아줬다). LLM 판단이 필요한 일이 아니라
 * **낱말 검사**로 충분하고, 결정론이라 오히려 더 확실하다.
 *
 * ⚠️ 축구 기사에 정상적으로 나오는 말("배당률이 낮았다")까지 막으면 멀쩡한 기사가 죽는다.
 *    그래서 **홍보 꼴을 갖춘 것만** 본다 — 사이트·가입·충전·보너스·먹튀 같은 유인 어휘.
 */
const GAMBLING_PROMO =
  /(베팅|배팅|토토|카지노|바카라)\s*(사이트|업체|사설)|먹튀|첫\s*충전|가입\s*머니|무료\s*쿠폰|안전\s*놀이터|프로모션\s*코드/

export function hasGamblingPromo(title: string, content: unknown): string | null {
  const text = `${title}
${extractTextFromTipTapJSON(content as TipTapNode)}`
  const hit = text.match(GAMBLING_PROMO)
  return hit ? `도박·베팅 홍보 문구: "${hit[0]}"` : null
}

/**
 * 기사에서 인물 이름을 뽑는다. 실패는 **빈 배열**이다 — 추출 실패가 발행을 막으면
 * 안 된다 (종전 검사관은 fail-closed 였지만 그건 판정이 있을 때 얘기다).
 * 이름을 못 뽑으면 표기 루프가 돌지 않을 뿐이고, 그건 표기 감사가 소급해서 잡는다.
 *
 * ⚠️ 모델은 **작성 모델과 다른 것**을 쓴다. 추출은 기계적인 일이라 4o-mini 로 충분하고,
 *    같은 모델로 돌리면 자기가 쓴 표기를 그대로 되읊을 뿐이다.
 */
export async function extractPersonNames(title: string, content: unknown): Promise<PersonNames> {
  const empty: PersonNames = { playerNamesKr: [], coachNamesKr: [] }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return empty

  const body = extractTextFromTipTapJSON(content as TipTapNode).slice(0, 4000)
  if (!body || body.length < 50) return empty

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        ...chatParams("gpt-4o-mini", { temperature: 0, max_tokens: 500 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: NAMES_PROMPT },
          {
            role: "user",
            content: `제목: ${title}

본문:
${body}`,
          },
        ],
      }),
    })
    if (!res.ok) return empty
    // ⚠️ 여기서 사용량 로깅(logUsage)을 부르지 않는다 — 그 모듈이 server-only 라
    //    import 하는 순간 이 파일이 env 의존이 되고, isWomensFootball 을 쓰는
    //    테스트 5개가 통째로 죽는다 (2026-08-25 실측). 순수하게 유지한다.
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      player_names_kr?: unknown[]
      coach_names_kr?: unknown[]
    }
    return {
      playerNamesKr: Array.isArray(parsed.player_names_kr)
        ? parsed.player_names_kr.map(String).slice(0, 20)
        : [],
      coachNamesKr: Array.isArray(parsed.coach_names_kr)
        ? parsed.coach_names_kr.map(String).slice(0, 10)
        : [],
    }
  } catch {
    return empty
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
interface ImageVerdict {
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
