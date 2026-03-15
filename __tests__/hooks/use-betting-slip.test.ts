import { describe, it, expect } from "vitest"
import type { SelectedBet, GroupedMatch, BetmanGame } from "@/components/betting/betting-types"

// ============================================================
// Pure logic extracted from use-betting-slip.ts for testing
// ============================================================

function calcTotalOdds(bets: SelectedBet[]): number {
  return bets.reduce((acc, bet) => acc * (bet.odds || 1), 1)
}

function calcExpectedReturn(betAmount: number, totalOdds: number): number {
  return Math.floor(betAmount * totalOdds)
}

/** Core state updater for bet selection (mirrors setSelectedBets callback) */
function applyBetSelection(
  prev: SelectedBet[],
  params: {
    gameId: string
    matchKey: string
    selection: string
    sport: string
    gameType: string
    handicap: number | null
    overUnderLine: number | null
    odds?: number
  },
  selectedSport: string | null
): { bets: SelectedBet[]; sportChange?: string | null; blocked?: string } {
  const { gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds } = params

  const existingGameBet = prev.find((b) => b.gameId === gameId)
  const existingMatchBet = prev.find((b) => b.matchKey === matchKey)

  // Toggle off same selection
  if (existingGameBet) {
    if (existingGameBet.selection === selection) {
      const newBets = prev.filter((b) => b.gameId !== gameId)
      return { bets: newBets, sportChange: newBets.length === 0 ? null : undefined }
    }
    return {
      bets: prev.map((b) => (b.gameId === gameId ? { ...b, selection, odds } : b)),
    }
  }

  // Replace existing bet for same match
  if (existingMatchBet) {
    const newBets = prev.filter((b) => b.matchKey !== matchKey)
    newBets.push({ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds })
    return { bets: newBets }
  }

  // First bet — lock sport
  if (prev.length === 0) {
    return {
      bets: [{ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }],
      sportChange: sport,
    }
  }

  // Cross-sport block
  if (sport !== selectedSport) {
    return { bets: prev, blocked: selectedSport || "" }
  }

  return {
    bets: [
      ...prev,
      { gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds },
    ],
  }
}

/** Validation checks before prediction submission */
function validateSubmission(
  selectedBets: SelectedBet[],
  betAmount: number,
  userBalls: number
): { valid: boolean; errorType?: string } {
  if (selectedBets.length === 0) return { valid: false, errorType: "no_bets" }
  if (betAmount <= 0) return { valid: false, errorType: "zero_amount" }
  const MAX_BET = 10
  if (betAmount > MAX_BET) return { valid: false, errorType: "max_exceeded" }
  if (betAmount > userBalls) return { valid: false, errorType: "insufficient_balls" }
  return { valid: true }
}

/** Match time validation */
function isMatchPlayable(
  match: GroupedMatch | undefined,
  gameId: string,
  now: Date
): { playable: boolean; reason?: string } {
  if (!match) return { playable: true }
  if (new Date(match.matchTime) <= now) return { playable: false, reason: "match_started" }
  const game = match.games.find((g) => g.id === gameId)
  if (game?.bet_close_at && new Date(game.bet_close_at) <= now) {
    return { playable: false, reason: "bet_closed" }
  }
  return { playable: true }
}

// ============================================================
// Helpers
// ============================================================

function makeBet(overrides: Partial<SelectedBet> = {}): SelectedBet {
  return {
    gameId: "g1",
    matchKey: "m1",
    selection: "홈팀",
    sport: "축구",
    gameType: "일반",
    handicap: null,
    overUnderLine: null,
    odds: 1.5,
    ...overrides,
  }
}

function makeMatch(overrides: Partial<GroupedMatch> = {}): GroupedMatch {
  return {
    matchKey: "m1",
    sport: "축구",
    leagueCode: "KL1",
    homeTeam: "울산",
    awayTeam: "전북",
    matchTime: new Date(Date.now() + 3600000).toISOString(), // 1시간 뒤
    venue: "울산문수",
    games: [],
    ...overrides,
  }
}

function makeGame(overrides: Partial<BetmanGame> = {}): BetmanGame {
  return {
    id: "g1",
    round_id: "r1",
    game_no: 1,
    match_time: new Date(Date.now() + 3600000).toISOString(),
    sport: "축구",
    league_code: "KL1",
    game_type: "일반",
    home_team_name: "울산",
    away_team_name: "전북",
    handicap: null,
    over_under_line: null,
    venue: "울산문수",
    status: "open",
    ...overrides,
  }
}

// ============================================================
// Tests
// ============================================================

describe("calcTotalOdds", () => {
  it("returns 1 for empty bets", () => {
    expect(calcTotalOdds([])).toBe(1)
  })

  it("returns single bet odds", () => {
    expect(calcTotalOdds([makeBet({ odds: 2.5 })])).toBe(2.5)
  })

  it("multiplies multiple bet odds", () => {
    const bets = [makeBet({ odds: 1.5 }), makeBet({ odds: 2.0 }), makeBet({ odds: 3.0 })]
    expect(calcTotalOdds(bets)).toBe(9.0)
  })

  it("treats undefined odds as 1", () => {
    const bets = [makeBet({ odds: 2.0 }), makeBet({ odds: undefined })]
    expect(calcTotalOdds(bets)).toBe(2.0)
  })

  it("handles fractional odds correctly", () => {
    const bets = [makeBet({ odds: 1.85 }), makeBet({ odds: 2.1 })]
    expect(calcTotalOdds(bets)).toBeCloseTo(3.885, 2)
  })
})

describe("calcExpectedReturn", () => {
  it("floors the result", () => {
    expect(calcExpectedReturn(3, 1.85)).toBe(5) // 5.55 → 5
  })

  it("returns 0 for 0 bet amount", () => {
    expect(calcExpectedReturn(0, 2.5)).toBe(0)
  })

  it("handles large odds", () => {
    expect(calcExpectedReturn(10, 100.0)).toBe(1000)
  })

  it("floors down fractional returns", () => {
    expect(calcExpectedReturn(1, 1.1)).toBe(1) // 1.1 → 1
  })
})

// ============================================================
// applyBetSelection
// ============================================================

describe("applyBetSelection", () => {
  const defaultParams = {
    gameId: "g1",
    matchKey: "m1",
    selection: "홈팀",
    sport: "축구",
    gameType: "일반",
    handicap: null as number | null,
    overUnderLine: null as number | null,
    odds: 1.5,
  }

  describe("first bet", () => {
    it("adds first bet and locks sport", () => {
      const result = applyBetSelection([], defaultParams, null)
      expect(result.bets).toHaveLength(1)
      expect(result.bets[0].gameId).toBe("g1")
      expect(result.sportChange).toBe("축구")
    })

    it("preserves all bet properties", () => {
      const params = {
        ...defaultParams,
        handicap: 1.5,
        overUnderLine: 2.5,
        odds: 2.1,
      }
      const result = applyBetSelection([], params, null)
      expect(result.bets[0]).toEqual(
        expect.objectContaining({
          gameId: "g1",
          handicap: 1.5,
          overUnderLine: 2.5,
          odds: 2.1,
        })
      )
    })
  })

  describe("toggle off same selection", () => {
    it("removes bet when clicking same selection", () => {
      const existing = [makeBet({ gameId: "g1", selection: "홈팀" })]
      const result = applyBetSelection(existing, { ...defaultParams, selection: "홈팀" }, "축구")
      expect(result.bets).toHaveLength(0)
    })

    it("clears sport when last bet is toggled off", () => {
      const existing = [makeBet({ gameId: "g1", selection: "홈팀" })]
      const result = applyBetSelection(existing, { ...defaultParams, selection: "홈팀" }, "축구")
      expect(result.sportChange).toBeNull()
    })

    it("keeps sport when other bets remain", () => {
      const existing = [
        makeBet({ gameId: "g1", selection: "홈팀", matchKey: "m1" }),
        makeBet({ gameId: "g2", selection: "원정팀", matchKey: "m2" }),
      ]
      const result = applyBetSelection(existing, { ...defaultParams, selection: "홈팀" }, "축구")
      expect(result.bets).toHaveLength(1)
      expect(result.bets[0].gameId).toBe("g2")
      expect(result.sportChange).toBeUndefined() // no change
    })
  })

  describe("change selection for same game", () => {
    it("updates selection without adding new bet", () => {
      const existing = [makeBet({ gameId: "g1", selection: "홈팀" })]
      const result = applyBetSelection(
        existing,
        { ...defaultParams, selection: "원정팀", odds: 2.0 },
        "축구"
      )
      expect(result.bets).toHaveLength(1)
      expect(result.bets[0].selection).toBe("원정팀")
      expect(result.bets[0].odds).toBe(2.0)
    })
  })

  describe("replace bet for same match (different game)", () => {
    it("replaces old game bet with new game bet on same match", () => {
      const existing = [makeBet({ gameId: "g1", matchKey: "m1", gameType: "일반" })]
      const result = applyBetSelection(
        existing,
        { ...defaultParams, gameId: "g2", matchKey: "m1", gameType: "핸디캡" },
        "축구"
      )
      expect(result.bets).toHaveLength(1)
      expect(result.bets[0].gameId).toBe("g2")
      expect(result.bets[0].gameType).toBe("핸디캡")
    })
  })

  describe("cross-sport block", () => {
    it("blocks bet from different sport", () => {
      const existing = [makeBet({ sport: "축구" })]
      const result = applyBetSelection(
        existing,
        { ...defaultParams, gameId: "g2", matchKey: "m2", sport: "야구" },
        "축구"
      )
      expect(result.blocked).toBe("축구")
      expect(result.bets).toEqual(existing) // unchanged
    })

    it("allows bet from same sport", () => {
      const existing = [makeBet({ sport: "축구" })]
      const result = applyBetSelection(
        existing,
        { ...defaultParams, gameId: "g2", matchKey: "m2", sport: "축구" },
        "축구"
      )
      expect(result.blocked).toBeUndefined()
      expect(result.bets).toHaveLength(2)
    })
  })

  describe("adding multiple bets", () => {
    it("accumulates bets for same sport", () => {
      const existing = [
        makeBet({ gameId: "g1", matchKey: "m1" }),
        makeBet({ gameId: "g2", matchKey: "m2" }),
      ]
      const result = applyBetSelection(
        existing,
        { ...defaultParams, gameId: "g3", matchKey: "m3" },
        "축구"
      )
      expect(result.bets).toHaveLength(3)
    })
  })
})

// ============================================================
// validateSubmission
// ============================================================

describe("validateSubmission", () => {
  it("fails when no bets selected", () => {
    const result = validateSubmission([], 5, 10)
    expect(result.valid).toBe(false)
    expect(result.errorType).toBe("no_bets")
  })

  it("fails when bet amount is 0", () => {
    const result = validateSubmission([makeBet()], 0, 10)
    expect(result.valid).toBe(false)
    expect(result.errorType).toBe("zero_amount")
  })

  it("fails when bet amount is negative", () => {
    const result = validateSubmission([makeBet()], -1, 10)
    expect(result.valid).toBe(false)
    expect(result.errorType).toBe("zero_amount")
  })

  it("fails when bet amount exceeds MAX_BET (10)", () => {
    const result = validateSubmission([makeBet()], 11, 100)
    expect(result.valid).toBe(false)
    expect(result.errorType).toBe("max_exceeded")
  })

  it("passes at exactly MAX_BET", () => {
    const result = validateSubmission([makeBet()], 10, 100)
    expect(result.valid).toBe(true)
  })

  it("fails when bet amount exceeds user balance", () => {
    const result = validateSubmission([makeBet()], 5, 3)
    expect(result.valid).toBe(false)
    expect(result.errorType).toBe("insufficient_balls")
  })

  it("passes at exactly user balance", () => {
    const result = validateSubmission([makeBet()], 5, 5)
    expect(result.valid).toBe(true)
  })

  it("passes valid submission", () => {
    const result = validateSubmission([makeBet(), makeBet()], 3, 10)
    expect(result.valid).toBe(true)
    expect(result.errorType).toBeUndefined()
  })
})

// ============================================================
// isMatchPlayable
// ============================================================

describe("isMatchPlayable", () => {
  it("returns playable when no match found", () => {
    const result = isMatchPlayable(undefined, "g1", new Date())
    expect(result.playable).toBe(true)
  })

  it("blocks when match has already started", () => {
    const pastTime = new Date(Date.now() - 60000).toISOString() // 1분 전
    const match = makeMatch({ matchTime: pastTime })
    const result = isMatchPlayable(match, "g1", new Date())
    expect(result.playable).toBe(false)
    expect(result.reason).toBe("match_started")
  })

  it("blocks when match time is exactly now", () => {
    const now = new Date()
    const match = makeMatch({ matchTime: now.toISOString() })
    const result = isMatchPlayable(match, "g1", now)
    expect(result.playable).toBe(false)
    expect(result.reason).toBe("match_started")
  })

  it("allows when match is in the future", () => {
    const futureTime = new Date(Date.now() + 3600000).toISOString()
    const match = makeMatch({ matchTime: futureTime })
    const result = isMatchPlayable(match, "g1", new Date())
    expect(result.playable).toBe(true)
  })

  it("blocks when bet_close_at has passed", () => {
    const futureMatch = new Date(Date.now() + 3600000).toISOString()
    const pastClose = new Date(Date.now() - 60000).toISOString()
    const game = makeGame({ id: "g1", bet_close_at: pastClose })
    const match = makeMatch({ matchTime: futureMatch, games: [game] })
    const result = isMatchPlayable(match, "g1", new Date())
    expect(result.playable).toBe(false)
    expect(result.reason).toBe("bet_closed")
  })

  it("allows when bet_close_at is in the future", () => {
    const futureTime = new Date(Date.now() + 3600000).toISOString()
    const game = makeGame({ id: "g1", bet_close_at: futureTime })
    const match = makeMatch({ matchTime: futureTime, games: [game] })
    const result = isMatchPlayable(match, "g1", new Date())
    expect(result.playable).toBe(true)
  })

  it("allows when game has no bet_close_at", () => {
    const futureTime = new Date(Date.now() + 3600000).toISOString()
    const game = makeGame({ id: "g1", bet_close_at: undefined })
    const match = makeMatch({ matchTime: futureTime, games: [game] })
    const result = isMatchPlayable(match, "g1", new Date())
    expect(result.playable).toBe(true)
  })

  it("allows when gameId not found in match games", () => {
    const futureTime = new Date(Date.now() + 3600000).toISOString()
    const game = makeGame({ id: "g999" })
    const match = makeMatch({ matchTime: futureTime, games: [game] })
    const result = isMatchPlayable(match, "g1", new Date())
    expect(result.playable).toBe(true)
  })
})

// ============================================================
// removeBet logic
// ============================================================

describe("removeBet", () => {
  function applyRemoveBet(bets: SelectedBet[], gameId: string) {
    const newBets = bets.filter((b) => b.gameId !== gameId)
    return { bets: newBets, clearSport: newBets.length === 0 }
  }

  it("removes the specified bet", () => {
    const bets = [makeBet({ gameId: "g1" }), makeBet({ gameId: "g2" })]
    const result = applyRemoveBet(bets, "g1")
    expect(result.bets).toHaveLength(1)
    expect(result.bets[0].gameId).toBe("g2")
  })

  it("clears sport when last bet removed", () => {
    const bets = [makeBet({ gameId: "g1" })]
    const result = applyRemoveBet(bets, "g1")
    expect(result.bets).toHaveLength(0)
    expect(result.clearSport).toBe(true)
  })

  it("does not clear sport when bets remain", () => {
    const bets = [makeBet({ gameId: "g1" }), makeBet({ gameId: "g2" })]
    const result = applyRemoveBet(bets, "g1")
    expect(result.clearSport).toBe(false)
  })

  it("does nothing when gameId not found", () => {
    const bets = [makeBet({ gameId: "g1" })]
    const result = applyRemoveBet(bets, "g999")
    expect(result.bets).toHaveLength(1)
  })
})

// ============================================================
// Prediction payload construction
// ============================================================

describe("prediction payload construction", () => {
  function buildPayload(
    bets: SelectedBet[],
    betAmount: number,
    isJournalist: boolean,
    analysisTitle: string,
    analysisText: string
  ) {
    const predictionsArray = bets.map((bet) => ({
      game_id: bet.gameId,
      prediction: bet.selection,
    }))
    const payload: Record<string, unknown> = {
      predictions: predictionsArray,
      betAmount,
      idempotency_key: "test-uuid",
    }
    if (isJournalist && analysisText.trim()) {
      if (analysisTitle.trim()) payload.analysis_title = analysisTitle.trim()
      payload.analysis_text = analysisText.trim()
    }
    return payload
  }

  it("maps bets to predictions array", () => {
    const bets = [
      makeBet({ gameId: "g1", selection: "홈팀" }),
      makeBet({ gameId: "g2", selection: "원정팀" }),
    ]
    const payload = buildPayload(bets, 5, false, "", "")
    expect(payload.predictions).toEqual([
      { game_id: "g1", prediction: "홈팀" },
      { game_id: "g2", prediction: "원정팀" },
    ])
    expect(payload.betAmount).toBe(5)
  })

  it("includes analysis for journalist with text", () => {
    const payload = buildPayload([makeBet()], 1, true, "분석 제목", "분석 내용입니다")
    expect(payload.analysis_title).toBe("분석 제목")
    expect(payload.analysis_text).toBe("분석 내용입니다")
  })

  it("excludes analysis for non-journalist", () => {
    const payload = buildPayload([makeBet()], 1, false, "제목", "내용")
    expect(payload.analysis_title).toBeUndefined()
    expect(payload.analysis_text).toBeUndefined()
  })

  it("excludes analysis when text is empty/whitespace", () => {
    const payload = buildPayload([makeBet()], 1, true, "제목", "   ")
    expect(payload.analysis_title).toBeUndefined()
    expect(payload.analysis_text).toBeUndefined()
  })

  it("excludes title when title is empty but includes text", () => {
    const payload = buildPayload([makeBet()], 1, true, "  ", "분석 내용")
    expect(payload.analysis_title).toBeUndefined()
    expect(payload.analysis_text).toBe("분석 내용")
  })

  it("trims analysis fields", () => {
    const payload = buildPayload([makeBet()], 1, true, "  제목  ", "  내용  ")
    expect(payload.analysis_title).toBe("제목")
    expect(payload.analysis_text).toBe("내용")
  })
})
