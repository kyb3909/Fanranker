// Shared types, constants, and utility functions for betting components

// ============================================================
// Type Definitions
// ============================================================

export interface TodayInfo {
  date: string
  label: string
}

export interface DailyRoundInfo {
  id: string
  daily_id: string
  status: string
  bet_open_at: string
  bet_close_at: string
  game_count: number
}

export interface BettingWindowInfo {
  isOpen: boolean
  message: string
  nextOpenAt?: string
}

export interface SportsGame {
  id: string
  round_id: string
  daily_round_id?: string
  game_no: number
  match_time: string
  sport: "축구" | "농구" | "배구" | "야구"
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  handicap: number | null
  over_under_line: number | null
  venue: string
  status: string
  bet_close_at?: string
  is_bettable?: boolean
  home_odds?: number
  draw_odds?: number
  away_odds?: number
  over_odds?: number
  under_odds?: number
  odd_odds?: number
  even_odds?: number
}

export interface GroupedMatch {
  matchKey: string
  sport: string
  leagueCode: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  venue: string
  games: SportsGame[]
}

export interface WindowInfo {
  start: string
  end: string
}

export interface SelectedBet {
  gameId: string
  matchKey: string
  selection: string
  sport: string
  gameType: string
  handicap: number | null
  overUnderLine: number | null
  odds?: number
}

export interface AlertModalState {
  isOpen: boolean
  type: "error" | "warning" | "success"
  title: string
  message: string
}

export interface RankingUser {
  rank: number
  user_id: string
  nickname: string
  avatar_url: string | null
  sport: string
  total_predictions: number
  correct_predictions: number
  wrong_predictions?: number
  accuracy: number
  total_wagered: number
  total_returns?: number
  net_profit: number
  profit_rate: number
  current_streak: number
  best_win_streak: number
}

export interface MyRank {
  rank: number
  user_id: string
  nickname: string
  avatar_url: string | null
  sport: string
  total_predictions: number
  correct_predictions: number
  accuracy: number
  total_wagered: number
  net_profit: number
  profit_rate: number
  current_streak: number
  best_win_streak: number
}

export interface MyStatsData {
  summary: {
    total_predictions: number
    correct_predictions: number
    wrong_predictions: number
    cancelled_predictions: number
    accuracy: number
    total_wagered: number
    total_returns: number
    net_profit: number
    profit_rate: number
    current_streak: number
    best_win_streak: number
    worst_lose_streak: number
  } | null
  sports: {
    sport: string
    total_predictions: number
    correct_predictions: number
    wrong_predictions: number
    accuracy: number
    total_wagered: number
    total_returns: number
    net_profit: number
    profit_rate: number
    current_streak: number
    best_win_streak: number
  }[]
}

export interface PredictionMatch {
  league: string
  home: string
  away: string
  selection: string // 사용자 선택 (Korean: "홈팀" | "원정팀" | "무" | "오버" | "언더")
  odds: number // 사용자가 선택한 옵션의 배당률 (하위 호환)
  homeOdds?: number
  awayOdds?: number
  drawOdds?: number
  overOdds?: number
  underOdds?: number
  result: string // 개별 경기 결과: "win" | "lose" | "pending"
  correctAnswer?: string // 정답 선택지 라벨 (Korean: "홈팀" | "원정팀" | "무" | "오버" | "언더")
  gameType?: string // 게임 유형: "일반" | "핸디캡" | "언더오버" 등
  matchTime?: string | null // ISO 경기 시간
  homeScore?: number | null // 완료된 경기의 홈 점수
  awayScore?: number | null // 완료된 경기의 원정 점수
  venue?: string | null // 경기장
  handicap?: number | null // 핸디캡 값 (핸디캡 경기일 때)
  overUnderLine?: number | null // 언더오버 기준선
}

export interface PredictionHistoryItem {
  id: string
  date: string
  sport: string
  matches: PredictionMatch[]
  totalOdds: number
  stake: number
  status: string
  profit: number
}

// ============================================================
// Constants
// ============================================================

export const gameTypeLabels: Record<string, string> = {
  일반: "승무패",
  S일반: "승무패",
  핸디캡: "핸디캡",
  S핸디캡: "핸디캡",
  언더오버: "언오버",
  S언더오버: "언오버",
  SUM: "합계",
}

export const sportColors: Record<string, { bg: string; text: string; border: string }> = {
  soccer: {
    bg: "bg-gradient-to-r from-rose-50 to-pink-50",
    text: "text-rose-900",
    border: "border-rose-200",
  },
  축구: {
    bg: "bg-gradient-to-r from-emerald-50 to-teal-50",
    text: "text-emerald-900",
    border: "border-emerald-200",
  },
  야구: {
    bg: "bg-gradient-to-r from-blue-50 to-indigo-50",
    text: "text-blue-900",
    border: "border-blue-200",
  },
  baseball: {
    bg: "bg-gradient-to-r from-blue-50 to-indigo-50",
    text: "text-blue-900",
    border: "border-blue-200",
  },
  basketball: {
    bg: "bg-gradient-to-r from-orange-50 to-amber-50",
    text: "text-orange-900",
    border: "border-orange-200",
  },
  농구: {
    bg: "bg-gradient-to-r from-orange-50 to-amber-50",
    text: "text-orange-900",
    border: "border-orange-200",
  },
  배구: {
    bg: "bg-gradient-to-r from-purple-50 to-violet-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
  volleyball: {
    bg: "bg-gradient-to-r from-purple-50 to-violet-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
}

export const sportColorFill: Record<string, { bg: string; text: string; border: string }> = {
  soccer: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  축구: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  야구: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  baseball: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  basketball: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  농구: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  배구: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  volleyball: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}

export const SPORT_ICONS: Record<string, string> = {
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

export const SPORT_TABS = [
  { id: "all", label: "전체", icon: "🎯" },
  { id: "축구", label: "축구", icon: "⚽" },
  { id: "야구", label: "야구", icon: "⚾" },
  { id: "농구", label: "농구", icon: "🏀" },
  { id: "배구", label: "배구", icon: "🏐" },
] as const

// ============================================================
// Utility Functions
// ============================================================

export function formatMatchTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date
    .toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(". ", ".")
    .replace(". ", " ")
}

export function formatDeadline(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
