// Re-export shared constants from betting-types (single source of truth)
export {
  getGameTypeLabel,
  SPORT_ICONS,
  sportColorFill,
  formatMatchTime,
} from "@/components/betting/betting-types"

export interface SportsGame {
  id: string
  gameId: string
  prediction: string
  isCorrect: boolean | null
  odds: number
  gameType: string
  handicap: number | null
  overUnderLine: number | null // 언오버 기준선
  result: string | null // 실제 결과: "home" | "away" | "draw" | "over" | "under"
  homeOdds: number | null
  awayOdds: number | null
  drawOdds: number | null
  overOdds: number | null
  underOdds: number | null
  match: {
    homeTeam: string
    awayTeam: string
    league: string
    matchTime: string
    status: string
    homeScore?: number
    awayScore?: number
  }
}

export interface SportsSlip {
  id: string
  type: "sports_slip"
  source: "sports"
  sport: string
  roundInfo: {
    year: number
    round: number
    deadline: string
    status: string
  } | null
  gameCount: number
  totalOdds: number
  ballsUsed: number
  isCorrect: boolean | null
  pointsEarned: number | null
  createdAt: string
  games: SportsGame[]
}

export interface RegularPrediction {
  id: string
  matchId: string
  predictionType: string
  predictedValue: string
  oddsAtPrediction: number
  amount: number
  isCorrect: boolean | null
  pointsEarned: number | null
  createdAt: string
  source: "regular"
  sport?: string
  match: {
    homeTeam: string
    awayTeam: string
    league: string
    matchTime: string
    status: string
    homeScore?: number
    awayScore?: number
  }
}

export type PredictionItem = SportsSlip | RegularPrediction

export interface Stats {
  totalPredictions: number
  correctPredictions: number
  accuracy: number
  totalPointsEarned: number
  totalPointsUsed: number
}

// Get prediction label
function getPredictionLabel(prediction: string, homeTeam: string, awayTeam: string): string {
  switch (prediction) {
    case "home":
      return homeTeam
    case "away":
      return awayTeam
    case "draw":
      return "무승부"
    case "over":
      return "오버"
    case "under":
      return "언더"
    case "odd":
      return "홀"
    case "even":
      return "짝"
    default:
      return prediction
  }
}
