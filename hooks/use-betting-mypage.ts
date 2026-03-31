import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import type { MyStatsData, PredictionHistoryItem } from "@/components/betting/betting-types"

interface PredictionMatch {
  match_time?: string
  sport_type?: string
  league?: { name_ko?: string; name?: string }
  home_team?: { name_ko?: string; name?: string }
  away_team?: { name_ko?: string; name?: string }
}

export function useBettingMyPage(
  active: boolean,
  myPageTab: "predictions" | "stats" | "gold" | "profile"
) {
  const { isSignedIn } = useAuth()

  const [myStats, setMyStats] = useState<MyStatsData | null>(null)
  const [isLoadingMyStats, setIsLoadingMyStats] = useState(false)
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const loadMyStats = useCallback(async () => {
    if (!isSignedIn) return
    setIsLoadingMyStats(true)
    try {
      const res = await fetch("/api/sports/my-stats")
      if (res.ok) {
        const data = await res.json()
        setMyStats(data)
      }
    } catch (err) {
      console.error("Failed to load my stats:", err)
    } finally {
      setIsLoadingMyStats(false)
    }
  }, [isSignedIn])

  const loadPredictionHistory = useCallback(async () => {
    if (!isSignedIn) return
    setIsLoadingHistory(true)
    try {
      const response = await fetch("/api/sports/prediction?status=all")
      if (!response.ok) throw new Error("Failed to load prediction history")
      const data = await response.json()
      const slips = data.slips || []

      const transformed: PredictionHistoryItem[] = slips.map(
        (slip: {
          id: string
          date: string
          sport: string
          stake: number
          totalOdds: number
          status: string
          profit: number
          matches: PredictionMatch[]
        }) => {
          const dateObj = new Date(slip.date)
          const dateStr = `${String(dateObj.getMonth() + 1).padStart(2, "0")}/${String(dateObj.getDate()).padStart(2, "0")} ${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`

          return {
            id: slip.id,
            date: dateStr,
            sport: slip.sport,
            matches: slip.matches,
            totalOdds: slip.totalOdds,
            stake: slip.stake,
            status: slip.status,
            profit: slip.profit,
          }
        }
      )

      setPredictionHistory(transformed)
    } catch (err) {
      console.error("Failed to load prediction history:", err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [isSignedIn])

  // Load data when tab becomes active
  useEffect(() => {
    if (active && myPageTab === "predictions") loadPredictionHistory()
  }, [active, myPageTab, loadPredictionHistory])

  useEffect(() => {
    if (active && myPageTab === "stats") loadMyStats()
  }, [active, myPageTab, loadMyStats])

  return {
    myStats,
    isLoadingMyStats,
    predictionHistory,
    isLoadingHistory,
  }
}
