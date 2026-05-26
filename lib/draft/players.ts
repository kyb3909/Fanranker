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

let _players: Player[] | null = null
let _loadingPromise: Promise<Player[]> | null = null

export async function loadPlayers(): Promise<Player[]> {
  if (_players) return _players
  if (_loadingPromise) return _loadingPromise
  _loadingPromise = fetch("/data/arsenal-players.json")
    .then((r) => {
      if (!r.ok) throw new Error(`arsenal-players load failed: ${r.status}`)
      return r.json() as Promise<Player[]>
    })
    .then((data) => {
      _players = data
      return data
    })
    .finally(() => {
      _loadingPromise = null
    })
  return _loadingPromise
}

/** Sync access — only works after loadPlayers() has been called */
export function getAllPlayers(): Player[] {
  return _players ?? []
}

export function getPlayersByPosition(pos: Position): Player[] {
  return getAllPlayers().filter((p) => p.position === pos)
}

export function getPlayerById(id: string): Player | undefined {
  return getAllPlayers().find((p) => p.id === id)
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
