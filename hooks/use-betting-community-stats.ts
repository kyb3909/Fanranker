import { useState, useEffect } from "react"

export interface CommunityStatsData {
  overall: {
    avgProfitRate: number | null
    avgAccuracy: number | null
    housePnl: number
    totalWagered: number
    totalReturns: number
    correctPredictions: number
    wrongPredictions: number
    totalParticipants: number
  }
  bySport: {
    sport: string
    avgProfitRate: number | null
    avgAccuracy: number | null
    housePnl: number
    totalWagered: number
    totalPredictions: number
    participants: number
  }[]
  dailyTrend: {
    date: string
    wagered: number
    payout: number
    housePnl: number
    avgProfitRate: number | null
    avgAccuracy: number | null
  }[]
}

export function useBettingCommunityStats(enabled: boolean) {
  const [stats, setStats] = useState<CommunityStatsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    setIsLoading(true)

    fetch("/api/betman/community-stats")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { stats, isLoading }
}
