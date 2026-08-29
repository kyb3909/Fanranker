import { describe, it, expect } from "vitest"
import { decideVerdict, WAIVE_HOURS } from "@/lib/betman/crosscheck-verdict"

const FT = (h: number | null, a: number | null) => ({ finished: true, homeScore: h, awayScore: a })

describe("decideVerdict", () => {
  it("두 출처 일치 → match (정산 허용)", () => {
    const r = decideVerdict({ lfa: FT(1, 3), betman: { home: 1, away: 3 }, hoursSinceKickoff: 6 })
    expect(r.verdict).toBe("match")
    expect(r.betmanScore).toBe("1-3")
    expect(r.lfaScore).toBe("1-3")
  })

  it("두 출처 불일치 → mismatch (정산 보류 + 알림 대상)", () => {
    const r = decideVerdict({ lfa: FT(2, 1), betman: { home: 1, away: 1 }, hoursSinceKickoff: 6 })
    expect(r.verdict).toBe("mismatch")
  })

  it("뒤집힌 스코어도 불일치다 — 홈·원정 순서는 봐주지 않는다 (confirmScore 와 같은 규율)", () => {
    const r = decideVerdict({ lfa: FT(3, 1), betman: { home: 1, away: 3 }, hoursSinceKickoff: 6 })
    expect(r.verdict).toBe("mismatch")
  })

  it("LFA 색인에 없음 + 유예 전 → pending (재시도)", () => {
    const r = decideVerdict({ lfa: null, betman: { home: 1, away: 0 }, hoursSinceKickoff: 5 })
    expect(r.verdict).toBe("pending")
  })

  it("LFA 색인에 없음 + 유예 초과 → waived (커버리지 밖 — 와이즈토토 단독 정산)", () => {
    const r = decideVerdict({
      lfa: null,
      betman: { home: 1, away: 0 },
      hoursSinceKickoff: WAIVE_HOURS + 1,
    })
    expect(r.verdict).toBe("waived")
  })

  it("LFA 가 아직 종료 전(진행 중 점수) → 확정으로 치지 않는다", () => {
    const r = decideVerdict({
      lfa: { finished: false, homeScore: 1, awayScore: 0 },
      betman: { home: 1, away: 0 },
      hoursSinceKickoff: 3,
    })
    expect(r.verdict).toBe("pending")
  })

  it("와이즈토토 스코어가 아직 비었으면 비교 불가 → pending", () => {
    const r = decideVerdict({
      lfa: FT(2, 2),
      betman: { home: null, away: null },
      hoursSinceKickoff: 3,
    })
    expect(r.verdict).toBe("pending")
    expect(r.lfaScore).toBe("2-2")
  })

  it("waived 경계 — 정확히 WAIVE_HOURS 에서 유예 발동", () => {
    const r = decideVerdict({
      lfa: null,
      betman: { home: 0, away: 0 },
      hoursSinceKickoff: WAIVE_HOURS,
    })
    expect(r.verdict).toBe("waived")
  })
})
