// Bet365 API 응답 타입 정의

// ===== Upcoming (예정 경기) =====
export interface Bet365League {
  id: string
  name: string
  cc?: string
}

export interface Bet365Team {
  id: string
  name: string
  image_id?: string
  cc?: string
}

export interface Bet365UpcomingMatch {
  id: string
  time: string // Unix timestamp
  time_status: string // "0" = 예정, "1" = 진행중, "3" = 종료
  league: Bet365League
  home: Bet365Team
  away: Bet365Team
  ss: string | null // 스코어 (예정이면 null)
}

export interface Bet365UpcomingResponse {
  success: number
  pager?: {
    page: number
    per_page: number
    total: number
  }
  results: Bet365UpcomingMatch[]
}

// ===== Prematch Odds (배당률) =====
export interface Bet365OddsItem {
  id: string
  odds: string
  name: string // "1" = 홈승, "Draw" = 무승부, "2" = 원정승
  header?: string
  handicap?: string
}

export interface Bet365OddsMarket {
  id: string
  name: string
  odds: Bet365OddsItem[]
}

export interface Bet365MainOdds {
  updated_at: string
  sp: {
    full_time_result?: Bet365OddsMarket
    double_chance?: Bet365OddsMarket
    correct_score?: Bet365OddsMarket
    goals_over_under?: Bet365OddsMarket
    both_teams_to_score?: Bet365OddsMarket
    asian_handicap?: Bet365OddsMarket
    draw_no_bet?: Bet365OddsMarket
    [key: string]: Bet365OddsMarket | undefined
  }
}

export interface Bet365PrematchOddsResult {
  FI: string
  event_id: string
  main?: Bet365MainOdds
  goals?: {
    updated_at: string
    sp: Record<string, Bet365OddsMarket | undefined>
  }
  half?: {
    updated_at: string
    sp: Record<string, Bet365OddsMarket | undefined>
  }
  asian_lines?: {
    updated_at: string
    sp: Record<string, Bet365OddsMarket | undefined>
  }
  schedule?: {
    updated_at: string
    sp: {
      main: { odds: string }[]
    }
  }
}

export interface Bet365PrematchOddsResponse {
  success: number
  results: Bet365PrematchOddsResult[]
}

// ===== Result (경기 결과) =====
export interface Bet365Scores {
  [half: string]: {
    home: string
    away: string
  }
}

export interface Bet365Stats {
  corners?: [string, string]
  yellowcards?: [string, string]
  redcards?: [string, string]
  penalties?: [string, string]
  possession_rt?: [string, string]
  [key: string]: [string, string] | undefined
}

export interface Bet365ResultMatch {
  id: string
  time: string
  time_status: string
  league: Bet365League
  home: Bet365Team
  away: Bet365Team
  ss: string // 최종 스코어 (예: "1-0")
  scores?: Bet365Scores
  stats?: Bet365Stats
  events?: Array<{ id: string; text: string }>
  extra?: {
    home_pos?: string
    away_pos?: string
    round?: string
    stadium?: string
    [key: string]: string | undefined
  }
}

export interface Bet365ResultResponse {
  success: number
  results: Bet365ResultMatch[]
}

// ===== 내부 앱용 통합 타입 =====
export type SportType = "soccer" | "baseball" | "basketball" | "volleyball"

export interface Match {
  id: string
  sport: SportType
  league: string
  home: string
  away: string
  date: string // "MM.DD" 형식
  time: string // "HH:mm" 형식
  homeOdds: number
  drawOdds: number // 야구/농구/배구는 0
  awayOdds: number
  status?: "upcoming" | "live" | "finished"
  score?: string
}

// API에서 내부 타입으로 변환하는 유틸리티 타입
export interface MatchWithOdds {
  match: Bet365UpcomingMatch
  odds: Bet365PrematchOddsResult | null
}

