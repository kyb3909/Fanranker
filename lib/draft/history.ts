import type { DraftRecord, GameHistory } from "./types"

const STORAGE_KEY = "snake-draft-history"

export function saveDraftResult(mode: string, draftedPlayers: { playerId: string; pickPosition: number }[]) {
  if (typeof window === "undefined") return

  const history = loadHistory()
  const modeHistory = history[mode] || { mode, totalDrafts: 0, records: [] }

  modeHistory.totalDrafts += 1

  draftedPlayers.forEach((draft) => {
    modeHistory.records.push({
      playerId: draft.playerId,
      pickPosition: draft.pickPosition,
      timestamp: Date.now(),
    })
  })

  history[mode] = modeHistory
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function loadHistory(): Record<string, GameHistory> {
  if (typeof window === "undefined") return {}

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export function calculatePlayerStats(mode: string, allPlayerIds: string[], totalPossiblePicks: number) {
  const history = loadHistory()[mode]
  if (!history) return []

  return allPlayerIds.map((playerId) => {
    const playerRecords = history.records.filter((r: DraftRecord) => r.playerId === playerId)
    const totalSelections = playerRecords.length
    const totalDrafts = history.totalDrafts

    let avgDraftPosition: number
    if (totalSelections === 0) {
      avgDraftPosition = totalPossiblePicks + 1
    } else {
      const sumPositions = playerRecords.reduce((sum: number, r: DraftRecord) => sum + r.pickPosition, 0)
      avgDraftPosition = sumPositions / totalSelections
    }

    const draftedPercentage = totalDrafts > 0 ? (totalSelections / totalDrafts) * 100 : 0

    return {
      playerId,
      avgDraftPosition,
      draftedPercentage,
      totalSelections,
      totalDrafts,
    }
  })
}
