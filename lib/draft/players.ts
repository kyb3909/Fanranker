import playersData from "@/data/fpl-players.json"

export type Position = "GK" | "DF" | "MF" | "FW"

export interface Player {
  id: string
  name: string
  nameKo: string
  team: string
  teamKo: string
  position: Position
  price: number
}

export const ALL_PLAYERS: Player[] = playersData as Player[]

export function getPlayersByPosition(pos: Position): Player[] {
  return ALL_PLAYERS.filter((p) => p.position === pos)
}

export function getPlayerById(id: string): Player | undefined {
  return ALL_PLAYERS.find((p) => p.id === id)
}

export const POSITION_COLORS: Record<Position, string> = {
  GK: "bg-amber-500 text-white",
  DF: "bg-blue-500 text-white",
  MF: "bg-green-500 text-white",
  FW: "bg-red-500 text-white",
}

export const POSITION_LABELS: Record<Position, string> = {
  GK: "골키퍼",
  DF: "수비수",
  MF: "미드필더",
  FW: "공격수",
}

/** 기본 포지션 제한 (4-4-2) */
export const POSITION_LIMITS: Record<Position, number> = {
  GK: 1,
  DF: 4,
  MF: 4,
  FW: 2,
}
