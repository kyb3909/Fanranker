/**
 * 경기 키 — **순수 모듈** (2026-09-01).
 *
 * betman 은 같은 경기를 마켓별 다중 행으로 갖는다. 그래서 "이 경기"를 가리키려면 행 id 가
 * 아니라 (홈, 원정, 킥오프) 세 값이 필요하다. 그 문자열을 만드는 코드가 지금 저장소 안에
 * **19곳에 인라인으로 흩어져 있고 포맷이 3종**이다:
 *
 *   `${home}_${away}_${time}`   ← polls.match_key 에 실제로 저장되는 형식 (정본)
 *   `${time}|${home}|${away}`
 *   `${home}|${away}|${time}`
 *
 * 포맷이 갈리면 "같은 경기"를 서로 다른 키로 부르게 되어, 경기 단위 판정이 조용히 어긋난다.
 * 여기를 단일 문으로 삼는다.
 *
 * ⚠️ **형식을 바꾸지 말 것.** `polls.match_key` 에 이미 저장된 값과 **글자 단위로 같아야**
 *    한다 (`idx_polls_motm_match_key` unique). 형식을 바꾸면 기존 MoTM 폴을 못 찾아
 *    "폴 결번" 오탐이 전량 발생하고, 새 폴이 중복 생성된다.
 *
 * ⚠️ `matchTime` 은 **DB 에서 온 문자열을 그대로** 넘길 것. `new Date().toISOString()` 로
 *    다시 만들면 PostgREST 표기(`+00:00`)와 달라져(`Z`) 키가 갈린다.
 */

export interface MatchKeyParts {
  homeTeam: string
  awayTeam: string
  /** betman_games.match_time 원문 (변환 금지) */
  matchTime: string
}

/** (홈, 원정, 킥오프) → 경기 키. polls.match_key 와 같은 형식이다 */
export function matchKeyOf(parts: MatchKeyParts): string {
  return `${parts.homeTeam}_${parts.awayTeam}_${parts.matchTime}`
}

/** 키를 사람이 읽는 라벨로 — 경보 본문·로그용 (키 자체를 노출하면 읽기 어렵다) */
export function matchLabelOf(parts: MatchKeyParts): string {
  return `${parts.homeTeam} vs ${parts.awayTeam}`
}
