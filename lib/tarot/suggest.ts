/**
 * 기사 → 타로 질문 생성 (2026-08-12 운영자 제안).
 *
 * 운영자: "기마랑이스 이적설이야 → 과연 기마랑이스 이적에 대한 타로점을 봐보라고 유도"
 *
 * ## 왜 질문을 미리 채우나
 * 콜드스타트에서 가장 큰 마찰은 빈 입력창이다("뭘 물어보지?"). 기사에서 들어오면
 * 질문이 이미 만들어져 있어 클릭 한 번에 리딩이 시작된다. 개인화가 아니라 **룰**이라
 * 유저 0명에서도 작동한다.
 *
 * ## 왜 규칙 기반인가 (LLM 아님)
 * 카드 하나당 LLM 을 부르면 피드 렌더가 그만큼 비싸지고 느려진다. 제목에서 주어를
 * 뽑는 정도는 정규식으로 충분하고, 실패하면 진입점을 **안 보여주면** 그만이다 —
 * 어설픈 질문을 채워 넣는 것보다 낫다.
 */

/** 이적 소재 판정 — 이 부류에만 진입점을 붙인다 */
const TRANSFER_RE = /이적|영입|임대|계약|합류|잔류|방출|메디컬|오퍼|제안|협상|러브콜|관심|이별|떠나/

/** 감독 거취 */
const MANAGER_RE = /감독|경질|선임|사령탑|후임/

/** 경기 소재 */
const MATCH_RE = /맞대결|경기|킥오프|선발|라인업|프리뷰|더비/

/**
 * 제목에서 핵심 인물·구단을 뽑는다.
 *
 * 우리 봇 기사 제목은 "[출처] 주어, 서술…" 꼴이 대부분이라 출처 프리픽스를 떼고
 * 첫 쉼표 앞을 취하면 주어가 나온다. 쉼표가 없으면 앞 두 어절.
 */
function extractSubject(title: string): string | null {
  const noSource = title.replace(/^\s*\[[^\]]{1,40}\]\s*/, "").trim()
  if (!noSource) return null

  const beforeComma = noSource.split(/[,·]/)[0].trim()
  // 너무 길면 주어가 아니라 문장 전체다 — 앞 두 어절로 자른다
  const subject =
    beforeComma.length <= 18 ? beforeComma : noSource.split(/\s+/).slice(0, 2).join(" ")

  // 조사·서술 꼬리를 떼어 호칭만 남긴다 ("기마랑이스가" → "기마랑이스")
  const cleaned = subject.replace(/(은|는|이|가|을|를|의|와|과|에|에게|께서)$/, "").trim()
  return cleaned.length >= 2 && cleaned.length <= 20 ? cleaned : null
}

interface TarotSuggestion {
  /** 프리필될 질문 */
  question: string
  /** 카드에 붙일 유도 문구 */
  label: string
}

/**
 * 기사 제목으로 타로 질문을 만든다. 만들 수 없으면 null — 진입점을 감춘다.
 *
 * ⚠️ 승부·이적을 **맞히는** 표현을 쓰지 않는다. "성사될까"가 아니라 "어떻게 흘러갈까".
 * 이 피처는 예언이 아니라 관점이고, 문구가 그 선을 먼저 그어야 한다.
 */
export function suggestTarot(title: string): TarotSuggestion | null {
  if (!title) return null
  const subject = extractSubject(title)
  if (!subject) return null

  if (TRANSFER_RE.test(title)) {
    return {
      question: `${subject} 이적, 어떻게 흘러갈까요?`,
      label: "이 이적, 카드는 뭐라고 할까?",
    }
  }
  if (MANAGER_RE.test(title)) {
    return {
      question: `${subject} 거취, 어떻게 될까요?`,
      label: "이 거취, 카드는 뭐라고 할까?",
    }
  }
  if (MATCH_RE.test(title)) {
    return {
      question: `${subject} 이번 경기, 흐름이 어떨까요?`,
      label: "이 경기 흐름, 카드로 볼까?",
    }
  }
  return null
}

/** 프리필 질문을 붙인 /tarot 링크 */
export function tarotHref(question: string, source: string): string {
  const params = new URLSearchParams({ q: question, utm_source: source })
  return `/tarot?${params}`
}
