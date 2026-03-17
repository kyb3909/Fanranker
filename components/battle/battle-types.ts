// 배틀 시스템 타입 정의 (준비 중)

export type BattleMode = "cheer" | "worldcup"
export type BattleStatus = "pending" | "upcoming" | "active" | "ended"

export interface BattleSide {
  id: string
  battle_id: string
  name: string
  color: string
  image_url: string | null
  score: number
}

export interface BattleParticipant {
  id: string
  battle_id: string
  side_id: string
  user_id: string
  created_at: string
}

export interface BattleComment {
  id: string
  battle_id: string
  side_id: string
  user_id: string
  nickname: string
  content: string
  created_at: string
  side_color?: string
  side_name?: string
}

export interface BattleRoom {
  id: string
  title: string
  description: string | null
  mode: BattleMode
  status: BattleStatus
  category: string | null
  thumbnail_url: string | null
  bracket_size: number | null
  total_participants: number
  created_by: string
  starts_at: string | null
  ends_at: string | null
  created_at: string
  sides?: BattleSide[]
  candidates?: WorldcupCandidate[]
}

export interface WorldcupCandidate {
  id: string
  battle_id: string
  name: string
  image_url: string | null
  description: string | null
  seed: number
  win_count: number
}

export interface WorldcupSession {
  id: string
  battle_id: string
  user_id: string
  bracket_size: number
  current_round: number
  winner_id: string | null
  completed_at: string | null
  created_at: string
}

export const BATTLE_CATEGORIES = [
  { id: "all", label: "전체", icon: "🔥" },
  { id: "축구", label: "축구", icon: "⚽" },
  { id: "야구", label: "야구", icon: "⚾" },
  { id: "농구", label: "농구", icon: "🏀" },
  { id: "배구", label: "배구", icon: "🏐" },
  { id: "자유", label: "자유", icon: "💬" },
] as const

export const BATTLE_STATUS_LABELS: Record<string, string> = {
  pending: "승인 대기",
  upcoming: "예정",
  active: "진행중",
  ended: "종료",
}

export function formatBattleTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function getBattleProgress(scoreA: number, scoreB: number): number {
  const total = scoreA + scoreB
  if (total === 0) return 50
  return Math.round((scoreA / total) * 100)
}

export function getRoundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "결승"
  if (round === totalRounds - 1) return "준결승"
  const remaining = Math.pow(2, totalRounds - round + 1)
  return `${remaining}강`
}
