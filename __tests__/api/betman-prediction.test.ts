import { describe, it, expect } from "vitest"
import { z } from "zod"

// ============================================================
// Schemas extracted from app/api/betman/prediction/route.ts
// ============================================================

const predictionItemSchema = z.object({
  game_id: z.string().min(1, "게임 ID가 필요합니다."),
  prediction: z.enum(["home", "draw", "away", "over", "under"], {
    message: "잘못된 예측 값입니다.",
  }),
})

const predictionPostSchema = z.object({
  predictions: z.array(predictionItemSchema).min(1, "예측 데이터가 필요합니다."),
  betAmount: z
    .number()
    .int()
    .min(1, "베팅 금액은 1볼 이상이어야 합니다.")
    .max(10, "베팅 금액은 최대 10볼입니다.")
    .optional(),
  analysis_title: z.string().max(100).optional(),
  analysis_text: z.string().max(5000).optional(),
  idempotency_key: z.string().uuid().optional(),
})

// ============================================================
// Business logic extracted from POST handler
// ============================================================

interface GameForValidation {
  id: string
  sport: string
  game_type: string
  status: string
  match_time: string
  home_team_name: string
  away_team_name: string
  daily_round_id: string | null
  home_win_odds: string
  away_win_odds: string
  draw_odds: string
  over_odds: string
  under_odds: string
}

/** Single sport validation */
function validateSingleSport(games: GameForValidation[]): { valid: boolean; error?: string } {
  const sports = [...new Set(games.map((g) => g.sport))]
  if (sports.length > 1) return { valid: false, error: "한 종목의 경기만 선택할 수 있습니다." }
  return { valid: true }
}

/** Duplicate match validation */
function validateNoDuplicateMatches(games: GameForValidation[]): {
  valid: boolean
  error?: string
} {
  const matchKeys = games.map((g) => `${g.home_team_name}_${g.away_team_name}_${g.match_time}`)
  const unique = [...new Set(matchKeys)]
  if (unique.length !== matchKeys.length) {
    return { valid: false, error: "같은 경기에 대해 중복 선택할 수 없습니다." }
  }
  return { valid: true }
}

/** Game status validation */
function validateGameStatus(games: GameForValidation[]): { valid: boolean; error?: string } {
  const nonScheduled = games.filter((g) => g.status !== "scheduled")
  if (nonScheduled.length > 0) {
    return { valid: false, error: "이미 시작되었거나 종료된 경기가 포함되어 있습니다" }
  }
  return { valid: true }
}

/** Prediction type matches game type */
function validatePredictionType(
  prediction: string,
  gameType: string,
  sport: string
): { valid: boolean; error?: string } {
  const isOverUnder = gameType.includes("언더오버")
  const isOverUnderPrediction = ["over", "under"].includes(prediction)

  if (isOverUnder && !isOverUnderPrediction) {
    return { valid: false, error: "언더오버 경기에는 over 또는 under만 선택할 수 있습니다." }
  }
  if (!isOverUnder && isOverUnderPrediction) {
    return { valid: false, error: "일반/핸디캡 경기에는 home, draw, away만 선택할 수 있습니다." }
  }
  if (sport === "농구" && prediction === "draw" && !isOverUnder) {
    return { valid: false, error: "농구 경기에서는 무승부를 선택할 수 없습니다." }
  }
  return { valid: true }
}

/** Daily round validation */
function validateDailyRound(games: GameForValidation[]): { valid: boolean; error?: string } {
  const dailyRoundIds = [...new Set(games.map((g) => g.daily_round_id).filter(Boolean))]
  if (dailyRoundIds.length === 0) {
    return { valid: false, error: "경기에 일일 라운드가 배정되지 않았습니다." }
  }
  if (dailyRoundIds.length > 1) {
    return { valid: false, error: "모든 경기는 같은 일일 라운드여야 합니다." }
  }
  return { valid: true }
}

/** Odds calculation */
function calcTotalOdds(
  predictions: { game_id: string; prediction: string }[],
  games: GameForValidation[]
): { totalOdds: number; error?: string } {
  let totalOdds = 1
  for (const pred of predictions) {
    const game = games.find((g) => g.id === pred.game_id)
    if (!game) continue
    const oddsMap: Record<string, number> = {
      home: parseFloat(game.home_win_odds) || 0,
      away: parseFloat(game.away_win_odds) || 0,
      draw: parseFloat(game.draw_odds) || 0,
      over: parseFloat(game.over_odds) || 0,
      under: parseFloat(game.under_odds) || 0,
    }
    const odds = oddsMap[pred.prediction]
    if (!odds || odds <= 0) {
      return { totalOdds: 0, error: `배당률이 설정되지 않은 경기가 있습니다` }
    }
    totalOdds *= odds
  }
  return { totalOdds: Math.round(totalOdds * 100) / 100 }
}

/** Slip status and profit calculation (from GET handler) */
function calcSlipResult(
  slipStatus: string,
  stake: number,
  totalOdds: number,
  predictions: { is_correct: boolean | null }[]
): { status: string; profit: number } {
  const allSettled = predictions.length > 0 && predictions.every((p) => p.is_correct !== null)
  const allCorrect = predictions.length > 0 && predictions.every((p) => p.is_correct === true)

  let status = "pending"
  if (slipStatus === "won") status = "win"
  else if (slipStatus === "lost") status = "lose"
  else if (slipStatus === "cancelled") status = "cancelled"
  else if (allSettled) status = allCorrect ? "win" : "lose"

  const profit =
    status === "win" ? Math.round(stake * totalOdds) - stake : status === "lose" ? -stake : 0

  return { status, profit }
}

/** Selection label mapping */
const selectionMap: Record<string, string> = {
  home: "홈팀",
  away: "원정팀",
  draw: "무",
  over: "오버",
  under: "언더",
}

// ============================================================
// Helpers
// ============================================================

function makeGame(overrides: Partial<GameForValidation> = {}): GameForValidation {
  return {
    id: "g1",
    sport: "축구",
    game_type: "일반",
    status: "scheduled",
    match_time: new Date(Date.now() + 3600000).toISOString(),
    home_team_name: "울산",
    away_team_name: "전북",
    daily_round_id: "dr1",
    home_win_odds: "1.85",
    away_win_odds: "2.10",
    draw_odds: "3.20",
    over_odds: "1.90",
    under_odds: "1.80",
    ...overrides,
  }
}

// ============================================================
// Tests: predictionPostSchema
// ============================================================

describe("predictionPostSchema", () => {
  const validPayload = {
    predictions: [{ game_id: "g1", prediction: "home" }],
    betAmount: 5,
  }

  it("validates correct payload", () => {
    expect(predictionPostSchema.safeParse(validPayload).success).toBe(true)
  })

  it("rejects empty predictions array", () => {
    const result = predictionPostSchema.safeParse({ ...validPayload, predictions: [] })
    expect(result.success).toBe(false)
  })

  it("rejects invalid prediction value", () => {
    const result = predictionPostSchema.safeParse({
      predictions: [{ game_id: "g1", prediction: "win" }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts all valid prediction values", () => {
    for (const pred of ["home", "draw", "away", "over", "under"]) {
      const result = predictionPostSchema.safeParse({
        predictions: [{ game_id: "g1", prediction: pred }],
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects betAmount of 0", () => {
    const result = predictionPostSchema.safeParse({ ...validPayload, betAmount: 0 })
    expect(result.success).toBe(false)
  })

  it("rejects betAmount over 10", () => {
    const result = predictionPostSchema.safeParse({ ...validPayload, betAmount: 11 })
    expect(result.success).toBe(false)
  })

  it("rejects non-integer betAmount", () => {
    const result = predictionPostSchema.safeParse({ ...validPayload, betAmount: 2.5 })
    expect(result.success).toBe(false)
  })

  it("accepts betAmount at boundaries (1 and 10)", () => {
    expect(predictionPostSchema.safeParse({ ...validPayload, betAmount: 1 }).success).toBe(true)
    expect(predictionPostSchema.safeParse({ ...validPayload, betAmount: 10 }).success).toBe(true)
  })

  it("accepts optional betAmount", () => {
    const result = predictionPostSchema.safeParse({
      predictions: [{ game_id: "g1", prediction: "home" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects analysis_title over 100 chars", () => {
    const result = predictionPostSchema.safeParse({
      ...validPayload,
      analysis_title: "a".repeat(101),
    })
    expect(result.success).toBe(false)
  })

  it("rejects analysis_text over 5000 chars", () => {
    const result = predictionPostSchema.safeParse({
      ...validPayload,
      analysis_text: "a".repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid idempotency_key", () => {
    const result = predictionPostSchema.safeParse({
      ...validPayload,
      idempotency_key: "not-uuid",
    })
    expect(result.success).toBe(false)
  })

  it("accepts valid uuid idempotency_key", () => {
    const result = predictionPostSchema.safeParse({
      ...validPayload,
      idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
    })
    expect(result.success).toBe(true)
  })

  it("rejects empty game_id", () => {
    const result = predictionPostSchema.safeParse({
      predictions: [{ game_id: "", prediction: "home" }],
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// Tests: Business validation logic
// ============================================================

describe("validateSingleSport", () => {
  it("passes single sport", () => {
    const games = [makeGame({ sport: "축구" }), makeGame({ sport: "축구" })]
    expect(validateSingleSport(games).valid).toBe(true)
  })

  it("fails multiple sports", () => {
    const games = [makeGame({ sport: "축구" }), makeGame({ sport: "야구" })]
    const result = validateSingleSport(games)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("한 종목")
  })
})

describe("validateNoDuplicateMatches", () => {
  it("passes unique matches", () => {
    const games = [
      makeGame({
        home_team_name: "울산",
        away_team_name: "전북",
        match_time: "2026-03-15T14:00:00Z",
      }),
      makeGame({
        home_team_name: "서울",
        away_team_name: "수원",
        match_time: "2026-03-15T14:00:00Z",
      }),
    ]
    expect(validateNoDuplicateMatches(games).valid).toBe(true)
  })

  it("fails duplicate matches", () => {
    const games = [
      makeGame({
        home_team_name: "울산",
        away_team_name: "전북",
        match_time: "2026-03-15T14:00:00Z",
      }),
      makeGame({
        home_team_name: "울산",
        away_team_name: "전북",
        match_time: "2026-03-15T14:00:00Z",
      }),
    ]
    expect(validateNoDuplicateMatches(games).valid).toBe(false)
  })
})

describe("validateGameStatus", () => {
  it("passes all scheduled", () => {
    const games = [makeGame({ status: "scheduled" }), makeGame({ status: "scheduled" })]
    expect(validateGameStatus(games).valid).toBe(true)
  })

  it("fails with in-progress game", () => {
    const games = [makeGame({ status: "scheduled" }), makeGame({ status: "in_progress" })]
    expect(validateGameStatus(games).valid).toBe(false)
  })

  it("fails with completed game", () => {
    const games = [makeGame({ status: "completed" })]
    expect(validateGameStatus(games).valid).toBe(false)
  })
})

describe("validatePredictionType", () => {
  it("allows home/draw/away for 일반 game", () => {
    expect(validatePredictionType("home", "일반", "축구").valid).toBe(true)
    expect(validatePredictionType("draw", "일반", "축구").valid).toBe(true)
    expect(validatePredictionType("away", "일반", "축구").valid).toBe(true)
  })

  it("allows over/under for 언더오버 game", () => {
    expect(validatePredictionType("over", "언더오버", "축구").valid).toBe(true)
    expect(validatePredictionType("under", "S언더오버", "농구").valid).toBe(true)
  })

  it("rejects home/draw/away for 언더오버 game", () => {
    expect(validatePredictionType("home", "언더오버", "축구").valid).toBe(false)
  })

  it("rejects over/under for 일반 game", () => {
    expect(validatePredictionType("over", "일반", "축구").valid).toBe(false)
  })

  it("rejects draw for 농구 일반 game", () => {
    const result = validatePredictionType("draw", "일반", "농구")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("농구")
  })

  it("allows draw for 축구 일반 game", () => {
    expect(validatePredictionType("draw", "일반", "축구").valid).toBe(true)
  })

  it("allows home/away for 핸디캡 game", () => {
    expect(validatePredictionType("home", "핸디캡", "축구").valid).toBe(true)
    expect(validatePredictionType("away", "S핸디캡", "야구").valid).toBe(true)
  })
})

describe("validateDailyRound", () => {
  it("passes same daily round", () => {
    const games = [makeGame({ daily_round_id: "dr1" }), makeGame({ daily_round_id: "dr1" })]
    expect(validateDailyRound(games).valid).toBe(true)
  })

  it("fails different daily rounds", () => {
    const games = [makeGame({ daily_round_id: "dr1" }), makeGame({ daily_round_id: "dr2" })]
    expect(validateDailyRound(games).valid).toBe(false)
  })

  it("fails no daily round assigned", () => {
    const games = [makeGame({ daily_round_id: null })]
    expect(validateDailyRound(games).valid).toBe(false)
  })
})

// ============================================================
// Tests: Odds calculation
// ============================================================

describe("calcTotalOdds", () => {
  it("calculates single game odds", () => {
    const games = [makeGame({ id: "g1", home_win_odds: "1.85" })]
    const result = calcTotalOdds([{ game_id: "g1", prediction: "home" }], games)
    expect(result.totalOdds).toBe(1.85)
  })

  it("multiplies multiple game odds", () => {
    const games = [
      makeGame({ id: "g1", home_win_odds: "2.00" }),
      makeGame({ id: "g2", away_win_odds: "3.00" }),
    ]
    const result = calcTotalOdds(
      [
        { game_id: "g1", prediction: "home" },
        { game_id: "g2", prediction: "away" },
      ],
      games
    )
    expect(result.totalOdds).toBe(6.0)
  })

  it("returns error for zero odds", () => {
    const games = [makeGame({ id: "g1", home_win_odds: "0" })]
    const result = calcTotalOdds([{ game_id: "g1", prediction: "home" }], games)
    expect(result.error).toBeDefined()
  })

  it("rounds to 2 decimal places", () => {
    const games = [
      makeGame({ id: "g1", home_win_odds: "1.85" }),
      makeGame({ id: "g2", away_win_odds: "2.10" }),
    ]
    const result = calcTotalOdds(
      [
        { game_id: "g1", prediction: "home" },
        { game_id: "g2", prediction: "away" },
      ],
      games
    )
    expect(result.totalOdds).toBe(3.89) // 1.85 * 2.10 = 3.885 → 3.89
  })
})

// ============================================================
// Tests: Slip result & profit calculation
// ============================================================

describe("calcSlipResult", () => {
  it("returns win status from slip", () => {
    const result = calcSlipResult("won", 5, 2.0, [{ is_correct: true }])
    expect(result.status).toBe("win")
    expect(result.profit).toBe(5) // 5*2 - 5
  })

  it("returns lose status from slip", () => {
    const result = calcSlipResult("lost", 5, 2.0, [{ is_correct: false }])
    expect(result.status).toBe("lose")
    expect(result.profit).toBe(-5)
  })

  it("returns cancelled status", () => {
    const result = calcSlipResult("cancelled", 5, 2.0, [])
    expect(result.status).toBe("cancelled")
    expect(result.profit).toBe(0)
  })

  it("derives win from all correct predictions", () => {
    const result = calcSlipResult("pending", 3, 3.0, [{ is_correct: true }, { is_correct: true }])
    expect(result.status).toBe("win")
    expect(result.profit).toBe(6) // 3*3 - 3
  })

  it("derives lose from any wrong prediction", () => {
    const result = calcSlipResult("pending", 3, 3.0, [{ is_correct: true }, { is_correct: false }])
    expect(result.status).toBe("lose")
    expect(result.profit).toBe(-3)
  })

  it("returns pending when predictions not settled", () => {
    const result = calcSlipResult("pending", 5, 2.0, [{ is_correct: true }, { is_correct: null }])
    expect(result.status).toBe("pending")
    expect(result.profit).toBe(0)
  })

  it("calculates profit with large odds", () => {
    const result = calcSlipResult("won", 10, 15.5, [{ is_correct: true }])
    expect(result.profit).toBe(145) // 10*15.5 - 10 = 145
  })
})

// ============================================================
// Tests: Selection label mapping
// ============================================================

describe("selectionMap", () => {
  it("maps all prediction values to Korean labels", () => {
    expect(selectionMap.home).toBe("홈팀")
    expect(selectionMap.away).toBe("원정팀")
    expect(selectionMap.draw).toBe("무")
    expect(selectionMap.over).toBe("오버")
    expect(selectionMap.under).toBe("언더")
  })
})
