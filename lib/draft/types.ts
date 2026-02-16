export interface Player {
  id: string
  name: string
  position: string
  rating: number
  salary: number
  image?: string
}

export interface Team {
  id: string
  name: string
  color: string
  players: Player[]
  budget: number
}

export interface GameConfig {
  id: string
  name: string
  description: string
  category: string
  icon: string
  totalPicks: number
  picksPerTeam: number
  budget: number
  positions: string[]
  timerSeconds: number
  salaryRange: { min: number; max: number }
  players: Player[]
}

export interface DraftRecord {
  playerId: string
  pickPosition: number
  timestamp: number
}

export interface GameHistory {
  mode: string
  totalDrafts: number
  records: DraftRecord[]
}
