/**
 * 시즌 오픈 이벤트 순위 산식 — "예측력" 지표 (2026-07-21 월드컵 데이터로 검증).
 *
 * 문제의식 (운영자 지적): 적중률 단일 = 쉬운 픽만 찍기 / 수익률(net) 단일 = 역배
 * 로또 한 방. 검증 사례: 월드컵 net 1위 라이스(+335)는 배당 34.5 한 방 + 고배당
 * 10연속 실패 → 실제 예측력 −0.16(음수).
 *
 * 공식 (슬립 단위, total_odds 만으로): 배당 O 의 시장 내재확률 = 1/O.
 *   맞힘 → +(1 − 1/O), 틀림 → −(1/O). 유저 합산 = Σ(적중여부 − 1/배당)
 * = "배당(시장)이 예상한 것보다 얼마나 더 맞혔나". 쉬운 픽(O=1.1)은 맞혀도 +0.09,
 * 어려운 픽(O=5)을 맞히면 +0.8. 표본이 쌓이면 운은 0으로 수렴한다.
 *
 * 정산(won/lost) 슬립만 산입 — pending/cancelled(환불) 제외.
 * 최소 표본 MIN_SETTLED_SLIPS 미만은 순위 산입 제외(1~2슬립 고배당 한 방 방지).
 */

export const MIN_SETTLED_SLIPS = 5

export interface ScorableSlip {
  user_id: string
  status: string
  stake: number | null
  total_odds: number | string | null
}

export interface UserEventScore {
  userId: string
  /** 예측력 = Σ(적중 − 1/배당). 순위 기준. */
  skillScore: number
  /** 정산 슬립 수 (won+lost) */
  settledSlips: number
  wonSlips: number
  /** 적중률 = won / settled (0~1) */
  hitRate: number
  /** 순수익 = Σ(won ? stake×odds − stake : −stake) — 참고 표기용 */
  net: number
  /** 최소 표본 충족 여부 — false 면 순위 미산입(집계 중 표기) */
  qualified: boolean
}

/** 슬립 목록 → 유저별 예측력 점수. 정렬: 예측력 desc → 적중률 desc → 표본 desc. */
export function computeUserScores(slips: ScorableSlip[]): UserEventScore[] {
  const byUser = new Map<string, { skill: number; settled: number; won: number; net: number }>()

  for (const s of slips) {
    if (s.status !== "won" && s.status !== "lost") continue
    const odds = Number(s.total_odds)
    if (!Number.isFinite(odds) || odds <= 1) continue // 배당 1 이하 = 내재확률 100%+, 데이터 오류
    const stake = Number(s.stake) || 0
    const hit = s.status === "won" ? 1 : 0

    const acc = byUser.get(s.user_id) ?? { skill: 0, settled: 0, won: 0, net: 0 }
    acc.skill += hit - 1 / odds
    acc.settled += 1
    acc.won += hit
    acc.net += hit ? stake * odds - stake : -stake
    byUser.set(s.user_id, acc)
  }

  return [...byUser.entries()]
    .map(([userId, a]) => ({
      userId,
      skillScore: a.skill,
      settledSlips: a.settled,
      wonSlips: a.won,
      hitRate: a.settled > 0 ? a.won / a.settled : 0,
      net: a.net,
      qualified: a.settled >= MIN_SETTLED_SLIPS,
    }))
    .sort(
      (x, y) =>
        y.skillScore - x.skillScore || y.hitRate - x.hitRate || y.settledSlips - x.settledSlips
    )
}

export interface GroupEventScore {
  groupSlug: string
  /** 유효 참여자(qualified)의 예측력 평균 — 팀 순위 기준 */
  avgSkillScore: number
  /** 유효 참여자 수 (슬립 5개 이상) */
  qualifiedCount: number
  /** 전체 참가자 수 (등록 기준 아님 — 슬립 1개 이상 제출자) */
  participantCount: number
  totalSettledSlips: number
  /** 팀 전체 적중률 (동점 1차 판정) */
  hitRate: number
}

/**
 * 팀 대항전 점수 — 유효 참여자(슬립 ≥5)의 예측력 평균 (설계 문서 §3: 소표본 왜곡 방지).
 * 동점 판정: 팀 적중률 → 유효 참여자 수.
 */
export function computeGroupScores(
  userScores: UserEventScore[],
  userGroup: Map<string, string>
): GroupEventScore[] {
  const byGroup = new Map<
    string,
    { skillSum: number; qualified: number; participants: number; settled: number; won: number }
  >()

  for (const u of userScores) {
    const slug = userGroup.get(u.userId)
    if (!slug) continue
    const g = byGroup.get(slug) ?? {
      skillSum: 0,
      qualified: 0,
      participants: 0,
      settled: 0,
      won: 0,
    }
    g.participants += 1
    g.settled += u.settledSlips
    g.won += u.wonSlips
    if (u.qualified) {
      g.qualified += 1
      g.skillSum += u.skillScore
    }
    byGroup.set(slug, g)
  }

  return [...byGroup.entries()]
    .map(([groupSlug, g]) => ({
      groupSlug,
      avgSkillScore: g.qualified > 0 ? g.skillSum / g.qualified : 0,
      qualifiedCount: g.qualified,
      participantCount: g.participants,
      totalSettledSlips: g.settled,
      hitRate: g.settled > 0 ? g.won / g.settled : 0,
    }))
    .sort(
      (x, y) =>
        y.avgSkillScore - x.avgSkillScore ||
        y.hitRate - x.hitRate ||
        y.qualifiedCount - x.qualifiedCount
    )
}
