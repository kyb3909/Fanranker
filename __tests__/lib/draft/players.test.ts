import { describe, it, expect } from "vitest"
import {
  POSITION_COLORS,
  POSITION_LABELS,
  POSITION_LIMITS,
  type Position,
} from "@/lib/draft/players"

describe("draft/players constants", () => {
  const positions: Position[] = ["GK", "DF", "MF", "FW"]

  it("all positions have colors", () => {
    for (const pos of positions) {
      expect(POSITION_COLORS[pos]).toBeTruthy()
      expect(POSITION_COLORS[pos]).toContain("bg-")
    }
  })

  it("all positions have Korean labels", () => {
    expect(POSITION_LABELS.GK).toBe("골키퍼")
    expect(POSITION_LABELS.DF).toBe("수비수")
    expect(POSITION_LABELS.MF).toBe("미드필더")
    expect(POSITION_LABELS.FW).toBe("공격수")
  })

  it("default formation is 4-4-2", () => {
    expect(POSITION_LIMITS.GK).toBe(1)
    expect(POSITION_LIMITS.DF).toBe(4)
    expect(POSITION_LIMITS.MF).toBe(4)
    expect(POSITION_LIMITS.FW).toBe(2)
  })

  it("4-4-2 sums to 11 players", () => {
    const total = Object.values(POSITION_LIMITS).reduce((sum, n) => sum + n, 0)
    expect(total).toBe(11)
  })

  it("getPlayersByPosition and getPlayerById return empty before load", async () => {
    const mod = await import("@/lib/draft/players")
    // Before loadPlayers is called, these should return empty/undefined
    expect(mod.getAllPlayers()).toEqual([])
    expect(mod.getPlayersByPosition("GK")).toEqual([])
    expect(mod.getPlayerById("nonexistent")).toBeUndefined()
  })
})
