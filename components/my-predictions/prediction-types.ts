// Game type labels
export const gameTypeLabels: Record<string, string> = {
  '일반': '승무패',
  'S일반': '승무패',
  '핸디캡': '핸디캡',
  'S핸디캡': '핸디캡',
  '언더오버': '언오버',
  'S언더오버': '언오버',
  'SUM': '합계',
}

// Sport icons
export const SPORT_ICONS: Record<string, string> = {
  "축구": "⚽",
  "야구": "⚾",
  "농구": "🏀",
  "배구": "🏐"
}

// Sport colors
export const sportColorFill: Record<string, { bg: string; text: string; border: string }> = {
  "축구": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "야구": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "농구": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "배구": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}

export interface BetmanGame {
  id: string
  gameId: string
  prediction: string
  isCorrect: boolean | null
  odds: number
  gameType: string
  handicap: number | null
  overUnderLine: number | null  // 언오버 기준선
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

export interface BetmanSlip {
  id: string
  type: 'betman_slip'
  source: 'betman'
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
  games: BetmanGame[]
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
  source: 'regular'
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

export type PredictionItem = BetmanSlip | RegularPrediction

export interface Stats {
  totalPredictions: number
  correctPredictions: number
  accuracy: number
  totalPointsEarned: number
  totalPointsUsed: number
}

// Format match time
export function formatMatchTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(". ", ".").replace(". ", " ")
}

// Get prediction label
export function getPredictionLabel(prediction: string, homeTeam: string, awayTeam: string): string {
  switch (prediction) {
    case 'home': return homeTeam
    case 'away': return awayTeam
    case 'draw': return '무승부'
    case 'over': return '오버'
    case 'under': return '언더'
    case 'odd': return '홀'
    case 'even': return '짝'
    default: return prediction
  }
}
