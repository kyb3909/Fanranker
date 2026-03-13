import { describe, it, expect, vi, beforeEach } from "vitest"
import { settlePredictions } from "@/lib/betman/settle"

// Mock Sentry to avoid initialization errors
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}))

// Mock batchUpdateUserStats
vi.mock("@/lib/betman/stats", () => ({
  batchUpdateUserStats: vi.fn().mockResolvedValue({ updated: 0, errors: [] }),
}))

// --- Types ---

interface GameData {
  id: string
  game_no: number
  game_type: string
  sport: string
  result: string
  status: string
  home_win_odds: string
  away_win_odds: string
  draw_odds: string
  over_odds: string
  under_odds: string
  odd_odds: string
  even_odds: string
  daily_round_id: string | null
}

interface PredictionData {
  id: string
  user_id: string
  game_id: string
  prediction: string
  status: string
  stake: number | null
  slip_id: string | null
  locked_odds: number | null
}

// --- Mock factory ---

/**
 * Creates a chainable Supabase mock.
 * Each `from()` call returns a fresh chain that resolves to the given response.
 * Tests can override `updateResolvedData` / `selectResolvedData` per call if needed.
 */
function createMockSupabase(options?: {
  updateData?: any[] | null
  updateError?: any
  selectData?: any
  selectError?: any
}) {
  const updateData = options?.updateData ?? [{ id: "test" }]
  const updateError = options?.updateError ?? null
  const selectData = options?.selectData ?? null
  const selectError = options?.selectError ?? null

  const mockFrom = vi.fn().mockImplementation(() => {
    const chain: any = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: updateData, error: updateError }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
        maybeSingle: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    return chain
  })

  return {
    from: mockFrom,
    rpc: vi.fn().mockResolvedValue({ error: null }),
  } as any
}

// --- Game / Prediction builders ---

function makeGame(overrides: Partial<GameData> = {}): GameData {
  return {
    id: "game-1",
    game_no: 1,
    game_type: "win_lose",
    sport: "football",
    result: "home",
    status: "finished",
    home_win_odds: "1.80",
    away_win_odds: "2.10",
    draw_odds: "3.50",
    over_odds: "1.90",
    under_odds: "1.95",
    odd_odds: "1.85",
    even_odds: "2.00",
    daily_round_id: "round-1",
    ...overrides,
  }
}

function makePrediction(overrides: Partial<PredictionData> = {}): PredictionData {
  return {
    id: "pred-1",
    user_id: "user-1",
    game_id: "game-1",
    prediction: "home",
    status: "pending",
    stake: 10,
    slip_id: null,
    locked_odds: null,
    ...overrides,
  }
}

// --- Tests ---

describe("settlePredictions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("correctly settles a single correct prediction", async () => {
    const game = makeGame({ result: "home" })
    const pred = makePrediction({ prediction: "home" })

    const supabase = createMockSupabase({ updateData: [{ id: "pred-1" }] })

    const result = await settlePredictions(supabase, [game], [pred])

    expect(result.settled).toBe(1)
    expect(result.correct).toBe(1)
    expect(result.wrong).toBe(0)
    expect(result.cancelled).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("correctly settles a single wrong prediction", async () => {
    const game = makeGame({ result: "away" })
    const pred = makePrediction({ prediction: "home" })

    const supabase = createMockSupabase({ updateData: [{ id: "pred-1" }] })

    const result = await settlePredictions(supabase, [game], [pred])

    expect(result.settled).toBe(1)
    expect(result.correct).toBe(0)
    expect(result.wrong).toBe(1)
    expect(result.cancelled).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("cancels prediction when game is cancelled", async () => {
    const game = makeGame({ status: "cancelled", result: "" })
    const pred = makePrediction()

    const supabase = createMockSupabase({ updateData: [{ id: "pred-1" }] })

    const result = await settlePredictions(supabase, [game], [pred])

    expect(result.cancelled).toBe(1)
    expect(result.settled).toBe(0)
    expect(result.correct).toBe(0)
    expect(result.wrong).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("skips prediction when game has no result yet", async () => {
    const game = makeGame({ status: "scheduled", result: "" })
    const pred = makePrediction()

    const supabase = createMockSupabase()

    const result = await settlePredictions(supabase, [game], [pred])

    expect(result.settled).toBe(0)
    expect(result.correct).toBe(0)
    expect(result.wrong).toBe(0)
    expect(result.cancelled).toBe(0)
    // from() should not have been called for an update since we skipped
    const updateCalls = supabase.from.mock.calls.filter(() => true)
    // Only the batchUpdateUserStats path may call from; no prediction update
    expect(result.errors).toHaveLength(0)
  })

  it("handles mixed results: 2 correct, 1 wrong, 1 cancelled", async () => {
    const games: GameData[] = [
      makeGame({ id: "g1", result: "home" }),
      makeGame({ id: "g2", result: "away" }),
      makeGame({ id: "g3", result: "draw" }),
      makeGame({ id: "g4", status: "cancelled", result: "" }),
    ]
    const predictions: PredictionData[] = [
      makePrediction({ id: "p1", game_id: "g1", prediction: "home" }), // correct
      makePrediction({ id: "p2", game_id: "g2", prediction: "away" }), // correct
      makePrediction({ id: "p3", game_id: "g3", prediction: "home" }), // wrong
      makePrediction({ id: "p4", game_id: "g4", prediction: "home", user_id: "user-1" }), // cancelled
    ]

    const supabase = createMockSupabase({ updateData: [{ id: "test" }] })

    const result = await settlePredictions(supabase, games, predictions)

    expect(result.correct).toBe(2)
    expect(result.wrong).toBe(1)
    expect(result.cancelled).toBe(1)
    expect(result.settled).toBe(3) // the 3 non-cancelled settled predictions
  })

  it("uses locked_odds when available instead of game odds", async () => {
    // locked_odds = 2.50 overrides game's home_win_odds = 1.80
    const game = makeGame({ result: "home", home_win_odds: "1.80" })
    const pred = makePrediction({ prediction: "home", locked_odds: 2.5 })

    // Intercept the update call to check points_earned
    let capturedUpdate: any = null
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockImplementation((data: any) => {
        capturedUpdate = data
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [{ id: "pred-1" }], error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }))

    const supabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ error: null }) } as any

    await settlePredictions(supabase, [game], [pred])

    // locked_odds (2.5) should be used, not home_win_odds (1.80)
    expect(capturedUpdate).not.toBeNull()
    expect(capturedUpdate.points_earned).toBe(2.5)
    expect(capturedUpdate.is_correct).toBe(true)
  })

  it("uses game odds when locked_odds is null", async () => {
    const game = makeGame({ result: "home", home_win_odds: "1.80" })
    const pred = makePrediction({ prediction: "home", locked_odds: null })

    let capturedUpdate: any = null
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockImplementation((data: any) => {
        capturedUpdate = data
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [{ id: "pred-1" }], error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }))

    const supabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ error: null }) } as any

    await settlePredictions(supabase, [game], [pred])

    expect(capturedUpdate).not.toBeNull()
    expect(capturedUpdate.points_earned).toBe(1.8)
  })

  it("accumulates errors when update fails", async () => {
    const game = makeGame({ result: "home" })
    const pred = makePrediction({ prediction: "home" })

    const supabase = createMockSupabase({
      updateData: null,
      updateError: { message: "DB write failed" },
    })

    const result = await settlePredictions(supabase, [game], [pred])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("pred-1")
    expect(result.errors[0]).toContain("DB write failed")
    // settled count should NOT increment on error
    expect(result.settled).toBe(0)
  })

  it("does not increment settled when updated rows is empty (already settled)", async () => {
    // If the .eq("status", "pending") filter matches nothing, data is []
    const game = makeGame({ result: "home" })
    const pred = makePrediction({ prediction: "home" })

    const supabase = createMockSupabase({ updateData: [] })

    const result = await settlePredictions(supabase, [game], [pred])

    // No rows matched the update → already settled or status wasn't pending
    expect(result.settled).toBe(0)
    expect(result.correct).toBe(0)
  })

  it("skips prediction when game_id is not in the provided games list", async () => {
    const game = makeGame({ id: "game-OTHER" })
    const pred = makePrediction({ game_id: "game-MISSING" })

    const supabase = createMockSupabase()

    const result = await settlePredictions(supabase, [game], [pred])

    expect(result.settled).toBe(0)
    expect(result.cancelled).toBe(0)
  })

  it("returns zero counts for empty inputs", async () => {
    const supabase = createMockSupabase()

    const result = await settlePredictions(supabase, [], [])

    expect(result).toEqual({
      settled: 0,
      correct: 0,
      wrong: 0,
      cancelled: 0,
      slipsWon: 0,
      slipsLost: 0,
      totalPayout: 0,
      statsUpdated: 0,
      errors: [],
    })
  })

  it("sets points_earned to 0 for wrong predictions regardless of odds", async () => {
    const game = makeGame({ result: "away", home_win_odds: "1.80" })
    const pred = makePrediction({ prediction: "home", locked_odds: null })

    let capturedUpdate: any = null
    const mockFrom = vi.fn().mockImplementation(() => ({
      update: vi.fn().mockImplementation((data: any) => {
        capturedUpdate = data
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [{ id: "pred-1" }], error: null }),
        }
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }))

    const supabase = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ error: null }) } as any

    await settlePredictions(supabase, [game], [pred])

    expect(capturedUpdate.points_earned).toBe(0)
    expect(capturedUpdate.is_correct).toBe(false)
  })
})
