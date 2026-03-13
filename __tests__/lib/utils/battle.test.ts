import { describe, it, expect } from "vitest"
import { formatBattleTime, getBattleProgress, getRoundLabel } from "@/lib/utils/battle"

describe("formatBattleTime", () => {
  it("formats date string as M/D HH:mm", () => {
    // 2026-03-14T15:30:00 → 3/14 15:30 (local time dependent)
    const result = formatBattleTime("2026-03-14T06:30:00.000Z") // 15:30 KST
    expect(result).toMatch(/\d{1,2}\/\d{1,2} \d{2}:\d{2}/)
  })

  it("pads minutes with zero", () => {
    const result = formatBattleTime("2026-01-05T00:05:00.000Z") // 09:05 KST
    expect(result).toContain(":05")
  })
})

describe("getBattleProgress", () => {
  it("returns 50 when both scores are 0", () => {
    expect(getBattleProgress(0, 0)).toBe(50)
  })

  it("returns 100 when only side A has score", () => {
    expect(getBattleProgress(10, 0)).toBe(100)
  })

  it("returns 0 when only side B has score", () => {
    expect(getBattleProgress(0, 10)).toBe(0)
  })

  it("returns correct percentage for mixed scores", () => {
    expect(getBattleProgress(3, 7)).toBe(30)
  })

  it("returns 50 for equal scores", () => {
    expect(getBattleProgress(5, 5)).toBe(50)
  })
})

describe("getRoundLabel", () => {
  it('returns "결승" for 2 remaining', () => {
    expect(getRoundLabel(16, 4)).toBe("결승") // 16 / 2^3 = 2
  })

  it('returns "4강" for 4 remaining', () => {
    expect(getRoundLabel(16, 3)).toBe("4강") // 16 / 2^2 = 4
  })

  it('returns "8강" for 8 remaining', () => {
    expect(getRoundLabel(16, 2)).toBe("8강") // 16 / 2^1 = 8
  })

  it('returns "16강" for 16 remaining', () => {
    expect(getRoundLabel(16, 1)).toBe("16강") // 16 / 2^0 = 16
  })

  it('returns "32강" for bracket size 32 round 1', () => {
    expect(getRoundLabel(32, 1)).toBe("32강")
  })
})
