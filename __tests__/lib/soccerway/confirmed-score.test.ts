import { describe, it, expect } from "vitest"
import { confirmScore } from "@/lib/soccerway/confirmed-score"

/**
 * 2026-08-25 운영자 확정 파이프라인:
 *   ① 산 피드(LFA)를 기준으로  ② 와이즈토토와 교차검증  ③ 맞을 때만 확정
 *   ④ 그 다음 소커웨이 기사가 있으면 그걸로 리포트를 쓴다 (없으면 안 쓴다)
 *
 * 이 판정이 부실하면 리포트 스코어 게이트도 부실하다 — 게이트는 "확정 스코어"를 전제한다.
 */
const lfa = (home: number | null, away: number | null, finished = true) => ({
  home,
  away,
  finished,
})

describe("confirmScore", () => {
  it("⭐두 출처가 같으면 확정", () => {
    expect(confirmScore(lfa(2, 3), { home: 2, away: 3 })).toEqual({ ok: true, score: "2-3" })
  })

  it("⭐두 출처가 다르면 확정하지 않는다", () => {
    const r = confirmScore(lfa(0, 0), { home: 3, away: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("불일치")
  })

  it("⚠️와이즈토토가 아직 없으면 확정 아님 — 교차검증을 안 거친 값은 확정이 아니다", () => {
    const r = confirmScore(lfa(2, 1), { home: null, away: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("교차검증")
  })

  it("산 피드에 경기가 없으면 확정 아님", () => {
    expect(confirmScore(null, { home: 1, away: 0 }).ok).toBe(false)
  })

  it("⚠️진행 중이면 확정 아님 — 중간 점수는 확정이 아니다", () => {
    const r = confirmScore(lfa(1, 0, false), { home: 1, away: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("종료 전")
  })

  it("0-0 도 정상 확정이다 (안 채워짐과 구분된다)", () => {
    expect(confirmScore(lfa(0, 0), { home: 0, away: 0 })).toEqual({ ok: true, score: "0-0" })
  })

  it("⚠️뒤집힘은 여기서 허용하지 않는다 — 홈-원정 순서를 정하는 자리다", () => {
    expect(confirmScore(lfa(2, 3), { home: 3, away: 2 }).ok).toBe(false)
  })
})
