/**
 * 리포트용 확정 스코어 — LFA 종료 결과만 사용한다.
 *
 * 2026-09-06 운영자 지시: 베트맨 결과 유무·불일치로 리포트를 막지 않는다.
 * Soccerway 원문으로 작성하며 LFA는 종료 여부와 홈-원정 최종 점수만 제공한다.
 * 베트맨 정산·배당·결과 수집 정책과는 무관하다.
 */

export interface ScoreSide {
  home: number | null
  away: number | null
}

export type ConfirmResult = { ok: true; score: string } | { ok: false; reason: string }

function pair(s: ScoreSide | null): string | null {
  if (!s || s.home == null || s.away == null) return null
  return `${s.home}-${s.away}`
}

/**
 * LFA의 종료 점수. 베트맨 점수는 입력 자체에서 제외한다.
 */
export function confirmScore(lfa: (ScoreSide & { finished: boolean }) | null): ConfirmResult {
  if (!lfa) return { ok: false, reason: "산 피드에 이 경기가 없다" }
  if (!lfa.finished) return { ok: false, reason: "산 피드 기준 아직 종료 전" }

  const a = pair(lfa)
  if (!a) return { ok: false, reason: "산 피드에 스코어가 없다" }

  return { ok: true, score: a }
}
