// ============================
// 선수 데이터 타입
// ============================
export interface DraftPlayer {
  id: string
  name: string
  nameEn?: string
  position: string
  team?: string
  teamEn?: string
  cost: number
  rating?: number
  salary?: number
  image?: string
}

// ============================
// 게임 모드 설정 (템플릿)
// ============================
export interface PositionConstraint {
  position: string
  label: string
  min: number
  max: number
}

export interface GameModeConfig {
  id: string
  name: string
  description: string
  category: string
  icon: string
  teamCount: number
  picksPerTeam: number
  salaryCap: number
  salaryUnit: string
  timerSeconds: number
  positions: PositionConstraint[]
  getPlayers: () => DraftPlayer[]
}

// ============================
// DB 모델 타입
// ============================
export type RoomStatus = 'waiting' | 'drafting' | 'completed' | 'abandoned'

export interface DraftRoom {
  id: number
  room_code: string
  game_mode_id: string
  host_user_id: string
  status: RoomStatus
  current_pick: number
  pick_deadline_at: string | null
  snake_order: number[]
  created_at: string
  updated_at: string
}

export interface RoomParticipant {
  id: number
  room_id: number
  user_id: string
  seat_index: number
  display_name: string
  avatar_url: string | null
  is_ready: boolean
  joined_at: string
}

export interface DraftPick {
  id: number
  room_id: number
  pick_number: number
  seat_index: number
  player_id: string
  is_auto_pick: boolean
  picked_at: string
}

export interface DraftResult {
  id: number
  room_id: number
  user_id: string
  seat_index: number
  total_cost: number
  player_ids: string[]
  gold_rewarded: number
  created_at: string
}

// ============================
// Broadcast 이벤트 타입
// ============================
export type DraftBroadcastEvent =
  | { type: 'player_joined'; participant: RoomParticipant }
  | { type: 'player_left'; user_id: string; seat_index: number }
  | { type: 'player_ready'; user_id: string; is_ready: boolean }
  | { type: 'game_started'; room: DraftRoom; snake_order: number[] }
  | { type: 'pick_made'; pick: DraftPick; next_pick: number; pick_deadline_at: string }
  | { type: 'game_completed'; results: DraftResult[] }

// ============================
// 클라이언트 상태 타입
// ============================
export interface DraftGameState {
  room: DraftRoom | null
  participants: RoomParticipant[]
  picks: DraftPick[]
  myPicks: DraftPick[]
  mySeatIndex: number | null
  availablePlayers: DraftPlayer[]
  budgets: Record<number, number> // seat_index → remaining budget
  positionCounts: Record<number, Record<string, number>> // seat_index → { position → count }
  isMyTurn: boolean
  isLoading: boolean
}

// ============================
// Legacy 호환 (기존 코드 참조용)
// ============================
/** @deprecated Use DraftPlayer instead */
export type Player = DraftPlayer
/** @deprecated Use GameModeConfig instead */
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
  players: DraftPlayer[]
}
/** @deprecated Use GameConfig instead */
export interface Team {
  id: string
  name: string
  color: string
  players: DraftPlayer[]
  budget: number
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
