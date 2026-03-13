import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  FORMATIONS,
  generateSnakeOrder,
  createInitialState,
  getCurrentSeat,
  getCurrentRound,
  getSeatLimits,
  isValidPick,
  makePick,
  getAIPick,
  getAvailablePlayers,
  getPickablePlayers,
  type Participant,
  type DraftState,
  type Formation,
} from "@/lib/draft/engine"
import type { Player } from "@/lib/draft/players"

// ---------------------------------------------------------------------------
// Mock players module
// ---------------------------------------------------------------------------
const mockPlayers: Player[] = [
  {
    id: "gk1",
    name: "GK1",
    nameKo: "골키퍼1",
    team: "T",
    teamKo: "팀",
    position: "GK",
    price: 5.0,
  },
  {
    id: "gk2",
    name: "GK2",
    nameKo: "골키퍼2",
    team: "T",
    teamKo: "팀",
    position: "GK",
    price: 4.5,
  },
  { id: "df1", name: "DF1", nameKo: "수비1", team: "T", teamKo: "팀", position: "DF", price: 7.0 },
  { id: "df2", name: "DF2", nameKo: "수비2", team: "T", teamKo: "팀", position: "DF", price: 6.5 },
  { id: "df3", name: "DF3", nameKo: "수비3", team: "T", teamKo: "팀", position: "DF", price: 6.0 },
  { id: "df4", name: "DF4", nameKo: "수비4", team: "T", teamKo: "팀", position: "DF", price: 5.5 },
  { id: "df5", name: "DF5", nameKo: "수비5", team: "T", teamKo: "팀", position: "DF", price: 5.0 },
  { id: "mf1", name: "MF1", nameKo: "미드1", team: "T", teamKo: "팀", position: "MF", price: 9.0 },
  { id: "mf2", name: "MF2", nameKo: "미드2", team: "T", teamKo: "팀", position: "MF", price: 8.0 },
  { id: "mf3", name: "MF3", nameKo: "미드3", team: "T", teamKo: "팀", position: "MF", price: 7.5 },
  { id: "mf4", name: "MF4", nameKo: "미드4", team: "T", teamKo: "팀", position: "MF", price: 7.0 },
  { id: "mf5", name: "MF5", nameKo: "미드5", team: "T", teamKo: "팀", position: "MF", price: 6.5 },
  { id: "fw1", name: "FW1", nameKo: "공격1", team: "T", teamKo: "팀", position: "FW", price: 10.0 },
  { id: "fw2", name: "FW2", nameKo: "공격2", team: "T", teamKo: "팀", position: "FW", price: 9.0 },
  { id: "fw3", name: "FW3", nameKo: "공격3", team: "T", teamKo: "팀", position: "FW", price: 8.5 },
]

vi.mock("@/lib/draft/players", () => ({
  getAllPlayers: () => mockPlayers,
  loadPlayers: async () => mockPlayers,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal set of participants for tests. */
function makeParticipants(count: number, formation: Formation = "4-4-2"): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    seatIndex: i,
    name: `Player${i}`,
    isAI: false,
    formation,
  }))
}

/**
 * Advance the draft by executing real picks for the given seat sequence.
 * `playerIds` must match `seats` in length.
 */
function advanceDraft(state: DraftState, assignments: Array<{ playerId: string }>): DraftState {
  let s = state
  for (const { playerId } of assignments) {
    s = makePick(s, playerId)
  }
  return s
}

// ---------------------------------------------------------------------------
// FORMATIONS constant
// ---------------------------------------------------------------------------

describe("FORMATIONS", () => {
  it("contains all 6 formation keys", () => {
    const keys = Object.keys(FORMATIONS)
    expect(keys).toHaveLength(6)
    expect(keys).toContain("4-4-2")
    expect(keys).toContain("4-3-3")
    expect(keys).toContain("3-5-2")
    expect(keys).toContain("3-4-3")
    expect(keys).toContain("5-3-2")
    expect(keys).toContain("5-4-1")
  })

  it("every formation sums to 11 players (GK+DF+MF+FW)", () => {
    for (const [name, limits] of Object.entries(FORMATIONS)) {
      const total = limits.GK + limits.DF + limits.MF + limits.FW
      expect(total, `${name} should sum to 11`).toBe(11)
    }
  })

  it("every formation has exactly 1 GK", () => {
    for (const [name, limits] of Object.entries(FORMATIONS)) {
      expect(limits.GK, `${name} GK`).toBe(1)
    }
  })

  it("4-4-2 has correct position counts", () => {
    expect(FORMATIONS["4-4-2"]).toEqual({ GK: 1, DF: 4, MF: 4, FW: 2 })
  })

  it("3-5-2 has correct position counts", () => {
    expect(FORMATIONS["3-5-2"]).toEqual({ GK: 1, DF: 3, MF: 5, FW: 2 })
  })

  it("5-4-1 has correct position counts", () => {
    expect(FORMATIONS["5-4-1"]).toEqual({ GK: 1, DF: 5, MF: 4, FW: 1 })
  })
})

// ---------------------------------------------------------------------------
// generateSnakeOrder
// ---------------------------------------------------------------------------

describe("generateSnakeOrder", () => {
  it("2 players / 3 rounds produces 6-element array", () => {
    const order = generateSnakeOrder(2, 3)
    expect(order).toHaveLength(6)
  })

  it("2 players / 3 rounds follows snake pattern", () => {
    // Round 1 (even): 0, 1 → Round 2 (odd, reversed): 1, 0 → Round 3 (even): 0, 1
    expect(generateSnakeOrder(2, 3)).toEqual([0, 1, 1, 0, 0, 1])
  })

  it("4 players / 2 rounds produces 8-element array", () => {
    const order = generateSnakeOrder(4, 2)
    expect(order).toHaveLength(8)
  })

  it("4 players / 2 rounds follows snake pattern", () => {
    // Round 1: 0,1,2,3 → Round 2 (reversed): 3,2,1,0
    expect(generateSnakeOrder(4, 2)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
  })

  it("1 player / N rounds — each seat is always 0", () => {
    const order = generateSnakeOrder(1, 4)
    expect(order).toEqual([0, 0, 0, 0])
  })

  it("3 players / 4 rounds alternates direction correctly", () => {
    const order = generateSnakeOrder(3, 4)
    // R1: 0,1,2  R2: 2,1,0  R3: 0,1,2  R4: 2,1,0
    expect(order).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0])
  })

  it("every seat index appears the same number of times", () => {
    const order = generateSnakeOrder(4, 4)
    for (let seat = 0; seat < 4; seat++) {
      expect(order.filter((s) => s === seat)).toHaveLength(4)
    }
  })

  it("total length equals playerCount × rounds", () => {
    expect(generateSnakeOrder(3, 5)).toHaveLength(15)
    expect(generateSnakeOrder(5, 3)).toHaveLength(15)
  })
})

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------

describe("createInitialState", () => {
  it("status is 'drafting'", () => {
    const state = createInitialState(makeParticipants(2))
    expect(state.status).toBe("drafting")
  })

  it("currentPick starts at 0", () => {
    const state = createInitialState(makeParticipants(2))
    expect(state.currentPick).toBe(0)
  })

  it("budget is 80 for each participant", () => {
    const state = createInitialState(makeParticipants(3))
    expect(state.budget).toEqual([80, 80, 80])
  })

  it("picks array is empty", () => {
    const state = createInitialState(makeParticipants(2))
    expect(state.picks).toHaveLength(0)
  })

  it("draftedPlayerIds is empty", () => {
    const state = createInitialState(makeParticipants(2))
    expect(state.draftedPlayerIds.size).toBe(0)
  })

  it("roster is initialised with empty arrays for each seat", () => {
    const participants = makeParticipants(3)
    const state = createInitialState(participants)
    expect(state.roster[0]).toEqual([])
    expect(state.roster[1]).toEqual([])
    expect(state.roster[2]).toEqual([])
  })

  it("totalRounds is 11", () => {
    const state = createInitialState(makeParticipants(2))
    expect(state.totalRounds).toBe(11)
  })

  it("snakeOrder length equals participants × 11", () => {
    const participants = makeParticipants(3)
    const state = createInitialState(participants)
    expect(state.snakeOrder).toHaveLength(33)
  })

  it("participants are stored as-is", () => {
    const participants = makeParticipants(2)
    const state = createInitialState(participants)
    expect(state.participants).toBe(participants)
  })
})

// ---------------------------------------------------------------------------
// getCurrentSeat
// ---------------------------------------------------------------------------

describe("getCurrentSeat", () => {
  it("returns seat 0 at the very start (currentPick = 0)", () => {
    const state = createInitialState(makeParticipants(3))
    expect(getCurrentSeat(state)).toBe(0)
  })

  it("follows snakeOrder indexing", () => {
    const state = createInitialState(makeParticipants(2))
    // snakeOrder for 2p/11r: [0,1, 1,0, 0,1, 1,0, ...]
    expect(state.snakeOrder[0]).toBe(getCurrentSeat(state))
  })

  it("after one pick the seat advances to next in snake order", () => {
    const state = createInitialState(makeParticipants(2))
    // fw1 costs 10, seat 0 is the first to pick
    const next = makePick(state, "fw1")
    expect(getCurrentSeat(next)).toBe(state.snakeOrder[1])
  })

  it("seat wraps to second seat on an odd round for 2 players", () => {
    // 2 players: round 2 starts at pick index 2 → snakeOrder[2] = 1 (reversed)
    const state = createInitialState(makeParticipants(2))
    expect(state.snakeOrder[2]).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getCurrentRound
// ---------------------------------------------------------------------------

describe("getCurrentRound", () => {
  it("returns 1 for pick 0 with 2 participants", () => {
    const state = createInitialState(makeParticipants(2))
    expect(getCurrentRound(state)).toBe(1)
  })

  it("returns 1 for pick 1 (still first round) with 2 participants", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1")
    expect(getCurrentRound(after)).toBe(1)
  })

  it("transitions to round 2 after all first-round picks for 2 participants", () => {
    let state = createInitialState(makeParticipants(2))
    // Round 1: seat 0 picks fw1, seat 1 picks fw2
    state = makePick(state, "fw1")
    state = makePick(state, "fw2")
    expect(getCurrentRound(state)).toBe(2)
  })

  it("returns correct round for 3 participants", () => {
    let state = createInitialState(makeParticipants(3))
    // All 3 of round 1
    state = makePick(state, "fw1") // seat 0
    state = makePick(state, "fw2") // seat 1
    state = makePick(state, "fw3") // seat 2
    expect(getCurrentRound(state)).toBe(2)
  })

  it("round increments by 1 for each completed set of N picks", () => {
    const participants = makeParticipants(2)
    let state = createInitialState(participants)

    // Round 1 picks
    state = makePick(state, "fw1") // pick 0
    state = makePick(state, "fw2") // pick 1
    expect(getCurrentRound(state)).toBe(2)

    // Round 2 picks (snake: seat 1 then seat 0)
    state = makePick(state, "fw3") // pick 2
    state = makePick(state, "mf1") // pick 3
    expect(getCurrentRound(state)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// getSeatLimits
// ---------------------------------------------------------------------------

describe("getSeatLimits", () => {
  it("returns default 4-4-2 limits for unknown seatIndex", () => {
    const state = createInitialState(makeParticipants(2, "4-4-2"))
    // seatIndex 99 doesn't exist → fallback
    expect(getSeatLimits(state, 99)).toEqual({ GK: 1, DF: 4, MF: 4, FW: 2 })
  })

  it("returns 4-4-2 limits for a participant using that formation", () => {
    const state = createInitialState(makeParticipants(2, "4-4-2"))
    expect(getSeatLimits(state, 0)).toEqual({ GK: 1, DF: 4, MF: 4, FW: 2 })
  })

  it("returns 3-5-2 limits for a participant using that formation", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "A", isAI: false, formation: "3-5-2" },
      { seatIndex: 1, name: "B", isAI: false, formation: "4-4-2" },
    ]
    const state = createInitialState(participants)
    expect(getSeatLimits(state, 0)).toEqual({ GK: 1, DF: 3, MF: 5, FW: 2 })
  })

  it("returns 4-3-3 limits for a participant using that formation", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "A", isAI: false, formation: "4-3-3" },
    ]
    const state = createInitialState(participants)
    expect(getSeatLimits(state, 0)).toEqual({ GK: 1, DF: 4, MF: 3, FW: 3 })
  })

  it("returns 5-3-2 limits correctly", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "A", isAI: false, formation: "5-3-2" },
    ]
    const state = createInitialState(participants)
    expect(getSeatLimits(state, 0)).toEqual({ GK: 1, DF: 5, MF: 3, FW: 2 })
  })

  it("each seat can have a different formation", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "A", isAI: false, formation: "5-4-1" },
      { seatIndex: 1, name: "B", isAI: false, formation: "3-4-3" },
    ]
    const state = createInitialState(participants)
    expect(getSeatLimits(state, 0)).toEqual({ GK: 1, DF: 5, MF: 4, FW: 1 })
    expect(getSeatLimits(state, 1)).toEqual({ GK: 1, DF: 3, MF: 4, FW: 3 })
  })
})

// ---------------------------------------------------------------------------
// isValidPick
// ---------------------------------------------------------------------------

describe("isValidPick", () => {
  it("returns false for an already-drafted player", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1") // seat 0 picks fw1
    // fw1 is now drafted; seat 1 tries to pick it
    expect(isValidPick(after, 1, "fw1")).toBe(false)
  })

  it("returns false for a non-existent player id", () => {
    const state = createInitialState(makeParticipants(2))
    expect(isValidPick(state, 0, "does-not-exist")).toBe(false)
  })

  it("returns false when player price exceeds remaining budget", () => {
    // Drain seat 0's budget below fw1's price (10.0)
    // We need a state where budget[0] < 10
    const participants = makeParticipants(2, "4-4-2")
    let state = createInitialState(participants)

    // Override budget artificially by reconstructing state
    const lowBudgetState: DraftState = { ...state, budget: [9.9, 80] }
    // fw1 costs 10.0 → exceeds 9.9
    expect(isValidPick(lowBudgetState, 0, "fw1")).toBe(false)
  })

  it("returns true when pick is within budget", () => {
    const state = createInitialState(makeParticipants(2))
    // budget is 80, gk1 costs 5.0
    expect(isValidPick(state, 0, "gk1")).toBe(true)
  })

  it("returns false when position limit is already reached (GK limit = 1)", () => {
    let state = createInitialState(makeParticipants(2))
    // seat 0 picks gk1 (fills the 1 GK slot)
    state = makePick(state, "gk1") // seat 0
    state = makePick(state, "fw1") // seat 1 picks (advance turn back to 0... depends on snake)
    // For 2 players, after pick 0 (seat 0) and pick 1 (seat 1), pick 2 is seat 1 (snake reverse)
    // Let's just test seat 0 directly without advancing picks
    const participants = makeParticipants(1, "4-4-2")
    let solo = createInitialState(participants)
    solo = makePick(solo, "gk1")
    // Now seat 0 has 1 GK → limit reached → gk2 should be invalid
    expect(isValidPick(solo, 0, "gk2")).toBe(false)
  })

  it("returns false when picking would make remaining slots impossible to fill", () => {
    // With totalRounds=11 and formation 4-4-2 (needs 1GK+4DF+4MF+2FW = 11),
    // picking a second FW when only 1 pick remains and GK is not yet filled
    // should be invalid because we can't fill GK in 0 remaining picks.
    //
    // Simulate: seat 0 has 10 picks done but 0 GKs filled (artificially crafted).
    // Use cheap players so budget stays above gk2 price (4.5).
    const participants = makeParticipants(1, "4-4-2")
    const state = createInitialState(participants)

    // cheap roster: FW×2(fw2@9+fw3@8.5), DF×4(df2@6.5+df3@6+df4@5.5+df5@5), MF×4(mf2@8+mf3@7.5+mf4@7+mf5@6.5)
    // total = 9+8.5+6.5+6+5.5+5+8+7.5+7+6.5 = 69.5  → remaining budget = 10.5 (≥ gk2 price 4.5)
    const filledRoster: Player[] = [
      mockPlayers.find((p) => p.id === "fw2")!,
      mockPlayers.find((p) => p.id === "fw3")!,
      mockPlayers.find((p) => p.id === "df2")!,
      mockPlayers.find((p) => p.id === "df3")!,
      mockPlayers.find((p) => p.id === "df4")!,
      mockPlayers.find((p) => p.id === "df5")!,
      mockPlayers.find((p) => p.id === "mf2")!,
      mockPlayers.find((p) => p.id === "mf3")!,
      mockPlayers.find((p) => p.id === "mf4")!,
      mockPlayers.find((p) => p.id === "mf5")!,
    ]
    const totalSpent = filledRoster.reduce((s, p) => s + p.price, 0)
    const craftedState: DraftState = {
      ...state,
      roster: { 0: filledRoster },
      draftedPlayerIds: new Set(filledRoster.map((p) => p.id)),
      currentPick: 10, // 10 picks done, 1 remaining
      picks: filledRoster.map((p, i) => ({
        pickNumber: i,
        seatIndex: 0,
        playerId: p.id,
        isAutoPick: false,
      })),
      budget: [Math.round((80 - totalSpent) * 10) / 10],
    }

    // Picking another FW (fw1) should be invalid — remaining slot must go to GK
    expect(isValidPick(craftedState, 0, "fw1")).toBe(false)
    // Picking GK (gk2 @ 4.5, affordable) should be valid
    expect(isValidPick(craftedState, 0, "gk2")).toBe(true)
  })

  it("returns true for a genuinely valid pick", () => {
    const state = createInitialState(makeParticipants(2))
    // fresh state, fw1 is available and affordable
    expect(isValidPick(state, 0, "fw1")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// makePick
// ---------------------------------------------------------------------------

describe("makePick", () => {
  it("deducts player price from the picking seat's budget", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1") // fw1 costs 10.0, seat 0 picks
    expect(after.budget[0]).toBe(70.0)
    expect(after.budget[1]).toBe(80.0) // seat 1 untouched
  })

  it("adds the player to the picking seat's roster", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1")
    expect(after.roster[0]).toHaveLength(1)
    expect(after.roster[0][0].id).toBe("fw1")
  })

  it("adds the player id to draftedPlayerIds", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1")
    expect(after.draftedPlayerIds.has("fw1")).toBe(true)
  })

  it("increments currentPick by 1", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1")
    expect(after.currentPick).toBe(1)
  })

  it("appends the pick record to picks array", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1")
    expect(after.picks).toHaveLength(1)
    expect(after.picks[0]).toMatchObject({
      pickNumber: 0,
      seatIndex: 0,
      playerId: "fw1",
      isAutoPick: false,
    })
  })

  it("isAutoPick flag is stored correctly", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1", true)
    expect(after.picks[0].isAutoPick).toBe(true)
  })

  it("does not mutate the original state (immutable update)", () => {
    const state = createInitialState(makeParticipants(2))
    const originalBudget = [...state.budget]
    const originalPicksLength = state.picks.length

    makePick(state, "fw1")

    expect(state.budget).toEqual(originalBudget)
    expect(state.picks).toHaveLength(originalPicksLength)
  })

  it("budget rounding is correct (avoids floating-point drift)", () => {
    // price 4.5 → 80 - 4.5 = 75.5
    const state = createInitialState(makeParticipants(1))
    const after = makePick(state, "gk2") // gk2 costs 4.5
    expect(after.budget[0]).toBe(75.5)
  })

  it("status becomes 'completed' when all picks are exhausted", () => {
    // 1 participant × 11 rounds = 11 picks needed
    const participants = makeParticipants(1, "4-4-2")
    let state = createInitialState(participants)

    // We pick one player per round, covering the 4-4-2 formation exactly:
    // 1 GK, 4 DF, 4 MF, 2 FW = 11
    const sequence = [
      "gk1", // GK
      "df1",
      "df2",
      "df3",
      "df4", // 4 DF
      "mf1",
      "mf2",
      "mf3",
      "mf4", // 4 MF
      "fw1",
      "fw2", // 2 FW
    ]
    for (const id of sequence) {
      expect(state.status).toBe("drafting")
      state = makePick(state, id)
    }
    expect(state.status).toBe("completed")
  })

  it("status remains 'drafting' before all picks are done", () => {
    const state = createInitialState(makeParticipants(2))
    const after = makePick(state, "fw1")
    expect(after.status).toBe("drafting")
  })
})

// ---------------------------------------------------------------------------
// getAvailablePlayers
// ---------------------------------------------------------------------------

describe("getAvailablePlayers", () => {
  it("returns all players when none have been drafted", () => {
    const state = createInitialState(makeParticipants(2))
    expect(getAvailablePlayers(state)).toHaveLength(mockPlayers.length)
  })

  it("decreases by 1 after each pick", () => {
    let state = createInitialState(makeParticipants(2))
    state = makePick(state, "fw1")
    expect(getAvailablePlayers(state)).toHaveLength(mockPlayers.length - 1)

    state = makePick(state, "fw2")
    expect(getAvailablePlayers(state)).toHaveLength(mockPlayers.length - 2)
  })

  it("does not include already-drafted players", () => {
    let state = createInitialState(makeParticipants(2))
    state = makePick(state, "fw1")
    const available = getAvailablePlayers(state)
    expect(available.find((p) => p.id === "fw1")).toBeUndefined()
  })

  it("returns an empty array when all players are drafted", () => {
    // Use 1 participant to simplify; only 11 picks possible and we have 15 players,
    // but after 11 picks the draft is completed; test this scenario via draftedPlayerIds
    const state = createInitialState(makeParticipants(1))
    const allDrafted: DraftState = {
      ...state,
      draftedPlayerIds: new Set(mockPlayers.map((p) => p.id)),
    }
    expect(getAvailablePlayers(allDrafted)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getPickablePlayers
// ---------------------------------------------------------------------------

describe("getPickablePlayers", () => {
  it("excludes already-drafted players", () => {
    let state = createInitialState(makeParticipants(2))
    state = makePick(state, "fw1") // seat 0 picks fw1
    // seat 0 picks next in snake (after seat 1)
    // For this test, craft: check seat 1's pickable list excludes fw1
    const pickable = getPickablePlayers(state, 1)
    expect(pickable.find((p) => p.id === "fw1")).toBeUndefined()
  })

  it("excludes players beyond the seat's budget", () => {
    const state = createInitialState(makeParticipants(1))
    const lowBudgetState: DraftState = { ...state, budget: [5.0] }
    // Players costing more than 5.0: fw1(10), fw2(9), fw3(8.5), mf1(9), mf2(8), mf3(7.5), mf4(7), mf5(6.5), df1(7), df2(6.5)
    const pickable = getPickablePlayers(lowBudgetState, 0)
    for (const p of pickable) {
      expect(p.price).toBeLessThanOrEqual(5.0)
    }
  })

  it("respects position limits", () => {
    // Seat 0 with 4-4-2 formation: GK limit = 1. After drafting gk1, gk2 should not be pickable.
    const participants = makeParticipants(1, "4-4-2")
    let state = createInitialState(participants)
    state = makePick(state, "gk1") // GK slot filled
    const pickable = getPickablePlayers(state, 0)
    expect(pickable.find((p) => p.id === "gk2")).toBeUndefined()
  })

  it("returns only valid picks at the very start of a draft", () => {
    const state = createInitialState(makeParticipants(2))
    const pickable = getPickablePlayers(state, 0)
    // Every player in pickable should pass isValidPick
    for (const p of pickable) {
      expect(isValidPick(state, 0, p.id)).toBe(true)
    }
  })

  it("is non-empty at the start of a draft with sufficient budget", () => {
    const state = createInitialState(makeParticipants(2))
    expect(getPickablePlayers(state, 0).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// getAIPick
// ---------------------------------------------------------------------------

describe("getAIPick", () => {
  it("returns a string (player id)", () => {
    const state = createInitialState(makeParticipants(2))
    const pick = getAIPick(state, 0)
    expect(typeof pick).toBe("string")
    expect(pick.length).toBeGreaterThan(0)
  })

  it("returns a player that exists in mockPlayers", () => {
    const state = createInitialState(makeParticipants(2))
    const pick = getAIPick(state, 0)
    expect(mockPlayers.find((p) => p.id === pick)).toBeDefined()
  })

  it("does not return an already-drafted player", () => {
    let state = createInitialState(makeParticipants(2))
    state = makePick(state, "fw1") // seat 0 drafted fw1
    // Now seat 1 is up
    const pick = getAIPick(state, 1)
    expect(pick).not.toBe("fw1")
  })

  it("returns a player the seat can afford", () => {
    const state = createInitialState(makeParticipants(2))
    const lowBudgetState: DraftState = { ...state, budget: [5.0, 80] }
    const pick = getAIPick(lowBudgetState, 0)
    const player = mockPlayers.find((p) => p.id === pick)!
    expect(player.price).toBeLessThanOrEqual(5.0)
  })

  it("does not exceed position limits", () => {
    const participants = makeParticipants(1, "4-4-2")
    let state = createInitialState(participants)
    state = makePick(state, "gk1") // GK slot filled
    // AI should not pick gk2
    const pick = getAIPick(state, 0)
    expect(pick).not.toBe("gk2")
  })

  it("returns a player id even on a late-game state with limited options", () => {
    // Pick 9 players for seat 0, leaving 2 picks; ensure AI still returns something
    const participants = makeParticipants(1, "4-4-2")
    let state = createInitialState(participants)
    const picks = ["gk1", "df1", "df2", "df3", "df4", "mf1", "mf2", "mf3", "mf4"]
    for (const id of picks) {
      state = makePick(state, id)
    }
    const pick = getAIPick(state, 0)
    expect(typeof pick).toBe("string")
    expect(pick.length).toBeGreaterThan(0)
  })

  it("prioritises urgent positions when few picks remain", () => {
    // Seat 0 uses 4-4-2; fill all but FW slots, leave 2 picks (both FW needed).
    // Remaining slots = 2, and AI must pick 2 FWs.
    const participants = makeParticipants(1, "4-4-2")
    let state = createInitialState(participants)
    // Fill: 1 GK, 4 DF, 4 MF → 9 picks, 2 remaining (FW)
    const picks = ["gk1", "df1", "df2", "df3", "df4", "mf1", "mf2", "mf3", "mf4"]
    for (const id of picks) {
      state = makePick(state, id)
    }
    // AI pick should be a FW
    const pick = getAIPick(state, 0)
    const player = mockPlayers.find((p) => p.id === pick)!
    expect(player.position).toBe("FW")
  })
})

// ---------------------------------------------------------------------------
// Integration: single-participant full draft (11 picks, 15 mock players — feasible)
// ---------------------------------------------------------------------------

describe("Integration: 1-player full draft", () => {
  it("completes with status 'completed' after all 11 picks", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: true, formation: "4-4-2" },
    ]
    let state = createInitialState(participants)
    expect(state.snakeOrder).toHaveLength(11)

    while (state.status === "drafting") {
      const seat = getCurrentSeat(state)
      const pick = getAIPick(state, seat)
      state = makePick(state, pick, true)
    }

    expect(state.status).toBe("completed")
    expect(state.picks).toHaveLength(11)
  })

  it("seat ends with exactly 11 players in roster", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: true, formation: "4-4-2" },
    ]
    let state = createInitialState(participants)

    while (state.status === "drafting") {
      const seat = getCurrentSeat(state)
      const pick = getAIPick(state, seat)
      state = makePick(state, pick, true)
    }

    expect(state.roster[0]).toHaveLength(11)
  })

  it("draftedPlayerIds count equals 11 picks made", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: true, formation: "4-4-2" },
    ]
    let state = createInitialState(participants)

    while (state.status === "drafting") {
      const seat = getCurrentSeat(state)
      const pick = getAIPick(state, seat)
      state = makePick(state, pick, true)
    }

    expect(state.draftedPlayerIds.size).toBe(11)
  })

  it("all drafted player ids are unique (no duplicate picks)", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: true, formation: "4-4-2" },
    ]
    let state = createInitialState(participants)

    while (state.status === "drafting") {
      const seat = getCurrentSeat(state)
      const pick = getAIPick(state, seat)
      state = makePick(state, pick, true)
    }

    const pickedIds = state.picks.map((p) => p.playerId)
    const uniqueIds = new Set(pickedIds)
    expect(uniqueIds.size).toBe(pickedIds.length)
  })
})

// ---------------------------------------------------------------------------
// Integration: 2-player snake draft (partial — verifies snake mechanics)
// ---------------------------------------------------------------------------

describe("Integration: 2-player snake draft mechanics", () => {
  it("snake order for 2 participants alternates correctly across the first 4 picks", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: false, formation: "4-4-2" },
      { seatIndex: 1, name: "Bob", isAI: false, formation: "4-4-2" },
    ]
    const state = createInitialState(participants)
    // [0,1, 1,0, 0,1, ...]
    expect(state.snakeOrder.slice(0, 6)).toEqual([0, 1, 1, 0, 0, 1])
  })

  it("picks accumulate correctly across both seats for first 4 picks", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: false, formation: "4-4-2" },
      { seatIndex: 1, name: "Bob", isAI: false, formation: "4-4-2" },
    ]
    let state = createInitialState(participants)

    // pick 0: seat 0 → fw1
    state = makePick(state, "fw1")
    expect(state.picks[0].seatIndex).toBe(0)
    expect(state.picks[0].playerId).toBe("fw1")

    // pick 1: seat 1 → fw2
    state = makePick(state, "fw2")
    expect(state.picks[1].seatIndex).toBe(1)
    expect(state.picks[1].playerId).toBe("fw2")

    // pick 2: seat 1 (snake reversal) → fw3
    state = makePick(state, "fw3")
    expect(state.picks[2].seatIndex).toBe(1)
    expect(state.picks[2].playerId).toBe("fw3")

    // pick 3: seat 0
    state = makePick(state, "mf1")
    expect(state.picks[3].seatIndex).toBe(0)
  })

  it("each seat has independent budget tracking", () => {
    const participants: Participant[] = [
      { seatIndex: 0, name: "Alice", isAI: false, formation: "4-4-2" },
      { seatIndex: 1, name: "Bob", isAI: false, formation: "4-4-2" },
    ]
    let state = createInitialState(participants)

    state = makePick(state, "fw1") // seat 0, costs 10
    state = makePick(state, "gk1") // seat 1, costs 5

    expect(state.budget[0]).toBe(70.0)
    expect(state.budget[1]).toBe(75.0)
  })
})
