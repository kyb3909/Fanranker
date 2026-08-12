/**
 * 채방관(採訪官) — 구단 서브레딧 보도에서 인터뷰 후보를 골라내는 결정론 판정 (LLM 0회).
 *
 * 대상 팀 = 시즌 사가(saga_type=season, active)를 가진 팀만. 카드의 최종 목적지가
 * 시즌 연대기라, 문서가 없는 팀의 인터뷰는 지금은 갈 곳이 없다 — 팀 확장은 시즌
 * 사가 추가와 함께 이 맵에 한 줄 추가.
 */

/** 서브레딧 → 시즌 사가 subject.team_id (sagas 실데이터와 일치해야 한다) */
export const CLUB_SUBREDDITS: Record<string, string> = {
  Gunners: "arsenal",
  LiverpoolFC: "liverpool",
  chelseafc: "chelsea",
}

/** 대조가 성립하려면 원문이 이만큼은 있어야 한다 (부분문자열 검증의 최소 재료) */
export const MIN_MATERIAL_LENGTH = 300

/**
 * 인터뷰 후보인가 — 레딧 제목의 관행이 신호다:
 *  · `Kerkez: “...”` — 발언자 콜론 + 따옴표 (구단 서브레딧 인터뷰 포스트의 표준형)
 *  · 제목 안에 40자 이상의 따옴표 인용
 *  · interview / press conference / presser 키워드
 *
 * 저작권 가드가 여기서 시작된다: 우리가 가져가는 건 **발언(인용)**뿐이고,
 * 기자의 분석·평가·칼럼은 뒤 단계(발췌관)가 구조적으로 못 가져간다.
 */
export function isInterviewCandidate(title: string, materialLength: number): boolean {
  if (materialLength < MIN_MATERIAL_LENGTH) return false
  const t = title.trim()
  // 발언자 콜론 + 따옴표 시작 (예: `Kerkez: “I don't like pressure...”`)
  if (/^[A-Z][\w .''’-]{1,40}:\s*["“‘']/.test(t)) return true
  // 제목 속 긴 인용 (40자 이상)
  const quoted = t.match(/["“]([^"”]{40,})["”]/)
  if (quoted) return true
  // 명시 키워드
  if (/\binterview\b|press conference|\bpresser\b|pre-?match quotes|post-?match quotes/i.test(t))
    return true
  return false
}

/** 따옴표·공백 정규화 — 발췌 대조(부분문자열)와 번역 전 정리가 공유하는 규약 */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 발췌 검증 — LLM 이 돌려준 인용이 원문(제목 포함)에 **글자 그대로** 존재하는가.
 * 요약·의역을 시키지 않고 오려내기만 시키는 이유가 이 대조다: 원문에 없는 문장은
 * 여기서 기계적으로 죽는다 — 환각이 구조적으로 0 이 되는 지점.
 */
export function verifyQuote(quote: string, material: string, title: string): boolean {
  const q = normalizeForMatch(quote)
  if (q.length < 15) return false // 너무 짧은 조각은 인용으로서 무의미 + 우연 일치 위험
  const hay = normalizeForMatch(`${title}\n${material}`)
  return hay.includes(q)
}
