import { describe, it, expect } from "vitest"

// ============================================================
// Logic extracted from app/api/predictions/settle/route.ts
// ============================================================

/**
 * POST body 유효성: daily_round_id 또는 game_ids(비어있지 않은 배열) 중 하나는 있어야 함.
 */
function validateSettleBody(body: { daily_round_id?: string; game_ids?: string[] }): {
  valid: boolean
  error?: string
} {
  if (!body.daily_round_id && (!body.game_ids || body.game_ids.length === 0)) {
    return { valid: false, error: "daily_round_id or game_ids is required." }
  }
  return { valid: true }
}

/**
 * 정산 가능한 게임 필터: status=cancelled 이거나 result가 확정(non-null).
 * 이 조건을 만족한 게임만 settlePredictions에 전달됨.
 */
interface GameForSettle {
  id: string
  status: string
  result: string | null
}

function filterSettleableGames<T extends GameForSettle>(games: T[]): T[] {
  return games.filter((g) => g.status === "cancelled" || g.result !== null)
}

describe("predictions/settle — POST body validation", () => {
  it("accepts daily_round_id alone", () => {
    expect(validateSettleBody({ daily_round_id: "round_123" })).toEqual({ valid: true })
  })

  it("accepts non-empty game_ids alone", () => {
    expect(validateSettleBody({ game_ids: ["game_1"] })).toEqual({ valid: true })
  })

  it("accepts both", () => {
    expect(validateSettleBody({ daily_round_id: "round_123", game_ids: ["game_1"] })).toEqual({
      valid: true,
    })
  })

  it("rejects empty body", () => {
    const r = validateSettleBody({})
    expect(r.valid).toBe(false)
    expect(r.error).toBe("daily_round_id or game_ids is required.")
  })

  it("rejects empty game_ids array", () => {
    expect(validateSettleBody({ game_ids: [] }).valid).toBe(false)
  })

  it("rejects undefined daily_round_id with undefined game_ids", () => {
    expect(validateSettleBody({ daily_round_id: undefined, game_ids: undefined }).valid).toBe(false)
  })
})

describe("predictions/settle — filterSettleableGames", () => {
  it("includes cancelled games even without result", () => {
    const games = [{ id: "g1", status: "cancelled", result: null }]
    expect(filterSettleableGames(games)).toHaveLength(1)
  })

  it("includes completed games with result", () => {
    const games = [{ id: "g1", status: "completed", result: "home" }]
    expect(filterSettleableGames(games)).toHaveLength(1)
  })

  it("excludes completed games without result (still pending result entry)", () => {
    const games = [{ id: "g1", status: "completed", result: null }]
    expect(filterSettleableGames(games)).toHaveLength(0)
  })

  it("mixed: keeps only settleable", () => {
    const games = [
      { id: "g1", status: "completed", result: "home" },
      { id: "g2", status: "completed", result: null },
      { id: "g3", status: "cancelled", result: null },
      { id: "g4", status: "cancelled", result: "draw" },
    ]
    const result = filterSettleableGames(games)
    expect(result.map((g) => g.id)).toEqual(["g1", "g3", "g4"])
  })

  it("empty input returns empty array", () => {
    expect(filterSettleableGames([])).toEqual([])
  })
})
