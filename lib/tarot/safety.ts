/**
 * 안전 가드 — 서버 사전 필터. 타로 서비스(D:/Projects/tarot)에서 이식.
 *
 * 위기 신호(자해·자살·타해) 질문은 카드 해석 대신 완화 메시지 + 전문 상담 자원으로
 * 대체한다. 축구 질문만 받는 화면이라도 사람은 무슨 말이든 적을 수 있고, 그때
 * 점괘로 답하는 것은 해가 된다. 프롬프트의 안전 규칙과 **이중 방어**다.
 *
 * 순수 함수 — 테스트 대상.
 */

/** 위기 신호. 오탐(과차단)보다 미탐(놓침)이 위험하므로 보수적으로 넓게 잡는다. */
const CRISIS_PATTERNS: RegExp[] = [
  /자\s*살/,
  /자\s*해/,
  /죽고\s*싶/,
  /죽어\s*버리/,
  /죽는\s*게\s*나/,
  /목숨을?\s*끊/,
  /극단적\s*(선택|생각)/,
  /살기\s*싫/,
  /사라지고\s*싶/,
  /스스로\s*(목숨|생을|해치)/,
  /손목을?\s*(긋|그[어으은])/,
  /죽이고\s*싶/,
  /suicide|self[-\s]?harm|kill\s*myself/i,
]

/**
 * 도박 유도 질문 — 이 사이트에서만 필요한 가드 (타로 서비스엔 없다).
 *
 * "이번 주 토토 뭐 찍어야 돼?" 같은 질문에 카드로 답하면, 무료 포인트 예측 서비스가
 * 실제 사행성 조언을 하는 화면이 된다. 카카오 심사 소명(약관 제6조의2 "금전 베팅
 * 미제공")과 정면으로 부딪히고, 무엇보다 남의 돈에 훈수하는 셈이라 하면 안 된다.
 */
const GAMBLING_PATTERNS: RegExp[] = [
  /토토|프로토|배트맨|사설|사다리|파워볼/,
  /(얼마|돈|만원|만\s*원|배당).{0,10}(걸|넣|베팅|배팅)/,
  /(적중|픽).{0,6}(알려|찍어|추천)/,
  /환전|출금|입금/,
]

export type SafetyVerdict = "ok" | "crisis" | "gambling"

/** 질문 텍스트를 검사한다. 질문이 없으면 통과. */
export function checkSafety(question: string | undefined | null): SafetyVerdict {
  if (!question) return "ok"
  if (CRISIS_PATTERNS.some((re) => re.test(question))) return "crisis"
  if (GAMBLING_PATTERNS.some((re) => re.test(question))) return "gambling"
  return "ok"
}

/** 위기 신호 — 카드 해석 대신 노출 */
export const CRISIS_MESSAGE =
  "지금 많이 힘든 시간을 보내고 계신 것 같아요. 이런 마음은 카드보다 사람에게 먼저 닿아야 해요. 혼자 견디지 마시고 아래 상담 창구에서 이야기를 나눠 보세요."

export const CRISIS_RESOURCES = [
  { name: "자살예방 상담전화", contact: "109 (24시간)" },
  { name: "정신건강 위기상담", contact: "1577-0199 (24시간)" },
  { name: "청소년 전화", contact: "1388" },
] as const

/** 도박 유도 — 카드 해석 대신 노출 */
export const GAMBLING_MESSAGE =
  "돈이 걸린 선택은 카드가 답할 수 있는 게 아니에요. 여기 예측은 무료로 주는 볼로 하는 놀이라 환전도 보상도 없어요. 대신 경기 흐름이나 이적설 같은 걸 물어보시면 신나게 봐드릴게요."
