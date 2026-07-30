import { describe, it, expect } from "vitest"
import { computeUserScores, computeGroupScores, MIN_SETTLED_SLIPS } from "@/lib/event/scoring"

/**
 * 시즌 오픈 이벤트 예측력 산식 — 검증된 설계(2026-07-21)를 계약으로 고정.
 * 핵심: 역배 로또 한 방(net 왕)이 순위를 지배하지 못하고,
 * 어려운 픽을 꾸준히 맞힌 사람이 올라온다.
 */

function slip(user: string, status: "won" | "lost" | "pending", odds: number, stake = 1) {
  return { user_id: user, status, stake, total_odds: odds }
}

describe("computeUserScores — 예측력 = Σ(적중 − 1/배당)", () => {
  it("쉬운 픽 적중은 거의 0, 어려운 픽 적중은 크게 가산", () => {
    const [easy] = computeUserScores([slip("a", "won", 1.1)])
    const [hard] = computeUserScores([slip("b", "won", 5.0)])
    expect(easy.skillScore).toBeCloseTo(1 - 1 / 1.1, 5) // ≈0.09
    expect(hard.skillScore).toBeCloseTo(1 - 1 / 5, 5) // 0.8
  })

  it("역배 로또 한 방 + 고배당 연속 실패 = 음수 (라이스 사례 재현)", () => {
    // 배당 34.5 한 방 적중 + 배당 10 짜리 10연속 실패
    const slips = [
      slip("rice", "won", 34.5),
      ...Array.from({ length: 10 }, () => slip("rice", "lost", 10)),
    ]
    const [rice] = computeUserScores(slips)
    // (1 − 1/34.5) + 10 × (−1/10) = 0.971 − 1.0 < 0
    expect(rice.skillScore).toBeLessThan(0)
    expect(rice.net).toBeGreaterThan(0) // net 은 플러스 — 지표가 갈라놓는 지점
  })

  it("꾸준한 중배당 적중이 로또 한 방을 이긴다", () => {
    const lotto = [
      slip("lotto", "won", 30),
      ...Array.from({ length: 9 }, () => slip("lotto", "lost", 8)),
    ]
    const steady = [
      ...Array.from({ length: 6 }, () => slip("steady", "won", 3)),
      ...Array.from({ length: 4 }, () => slip("steady", "lost", 3)),
    ]
    const scores = computeUserScores([...lotto, ...steady])
    expect(scores[0].userId).toBe("steady")
  })

  it("pending/cancelled 은 산입하지 않는다", () => {
    const scores = computeUserScores([
      slip("a", "won", 2),
      slip("a", "pending", 2),
      { user_id: "a", status: "cancelled", stake: 1, total_odds: 2 },
    ])
    expect(scores[0].settledSlips).toBe(1)
  })

  it("배당 ≤1 데이터 오류는 건너뛴다", () => {
    const scores = computeUserScores([slip("a", "won", 1.0), slip("a", "won", 0)])
    expect(scores).toHaveLength(0)
  })

  it(`최소 표본 ${MIN_SETTLED_SLIPS}슬립 미만은 qualified=false`, () => {
    const four = Array.from({ length: 4 }, () => slip("a", "won", 3))
    expect(computeUserScores(four)[0].qualified).toBe(false)
    const five = Array.from({ length: 5 }, () => slip("b", "won", 3))
    expect(computeUserScores(five)[0].qualified).toBe(true)
  })

  it("적중률·net 참고 지표를 함께 계산한다", () => {
    const [s] = computeUserScores([
      slip("a", "won", 2, 5), // +5
      slip("a", "lost", 2, 3), // -3
    ])
    expect(s.hitRate).toBeCloseTo(0.5)
    expect(s.net).toBeCloseTo(2)
  })
})

describe("computeGroupScores — 팀 대항전 = 유효 참여자 예측력 평균", () => {
  it("유효 참여자(≥5슬립)만 평균에 들어간다 — 1슬립 뜨내기가 팀 평균을 못 흔든다", () => {
    const kopSteady = Array.from({ length: 5 }, () => slip("k1", "won", 3)) // skill ≈ 3.33
    const kopDrifter = [slip("k2", "won", 20)] // skill 0.95 — 미달, 평균 제외
    const bluesSteady = Array.from({ length: 5 }, (_, i) => slip("b1", i < 2 ? "won" : "lost", 3))
    const users = computeUserScores([...kopSteady, ...kopDrifter, ...bluesSteady])
    const groups = computeGroupScores(
      users,
      new Map([
        ["k1", "kop"],
        ["k2", "kop"],
        ["b1", "blues"],
      ])
    )
    const kop = groups.find((g) => g.groupSlug === "kop")!
    expect(kop.qualifiedCount).toBe(1)
    expect(kop.participantCount).toBe(2)
    expect(kop.avgSkillScore).toBeCloseTo(5 * (1 - 1 / 3), 5)
    expect(groups[0].groupSlug).toBe("kop")
  })

  it("미등록 유저 슬립은 팀 집계에서 제외", () => {
    const users = computeUserScores(Array.from({ length: 5 }, () => slip("x", "won", 2)))
    const groups = computeGroupScores(users, new Map())
    expect(groups).toHaveLength(0)
  })
})
