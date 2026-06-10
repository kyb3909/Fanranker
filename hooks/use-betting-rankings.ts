import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import type { RankingUser, MyRank } from "@/types/betting"

export function useBettingRankings(active: boolean) {
  const { isSignedIn } = useAuth()

  const [rankings, setRankings] = useState<RankingUser[]>([])
  const [isLoadingRankings, setIsLoadingRankings] = useState(false)
  const [rankingSportFilter, setRankingSportFilter] = useState<string>("전체")
  const [rankingFilter, setRankingFilter] = useState<"profit" | "winRate" | "roi">("profit")
  const [myRank, setMyRank] = useState<MyRank | null>(null)

  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set())
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set())

  const loadRankings = useCallback(async () => {
    setIsLoadingRankings(true)
    try {
      const sortMap: Record<string, string> = {
        profit: "net_profit",
        winRate: "accuracy",
        roi: "profit_rate",
      }
      const sortParam = sortMap[rankingFilter] || "profit_rate"
      const response = await fetch(
        `/api/sports/rankings?sport=${encodeURIComponent(rankingSportFilter)}&sort=${sortParam}&limit=50`
      )
      if (!response.ok) {
        setRankings([])
        setMyRank(null)
        return
      }
      const data = await response.json()
      setRankings(data?.rankings || [])
      setMyRank(data?.my_rank || null)
    } catch {
      console.error("Failed to load rankings")
      setRankings([])
      setMyRank(null)
    } finally {
      setIsLoadingRankings(false)
    }
  }, [rankingFilter, rankingSportFilter])

  const loadFollows = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch("/api/follow")
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers(new Set(data.following || []))
      }
    } catch (err) {
      console.error("Failed to load follows:", err)
    }
  }, [isSignedIn])

  const handleFollow = useCallback(async (userId: string) => {
    setFollowLoading((prev) => new Set(prev).add(userId))
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers((prev) => {
          const newSet = new Set(prev)
          if (data.action === "followed") newSet.add(userId)
          else newSet.delete(userId)
          return newSet
        })
      }
    } catch (err) {
      console.error("Failed to follow/unfollow:", err)
    } finally {
      setFollowLoading((prev) => {
        const s = new Set(prev)
        s.delete(userId)
        return s
      })
    }
  }, [])

  // Load rankings when tab becomes active or filters change
  useEffect(() => {
    if (active) loadRankings()
  }, [active, loadRankings])

  // Load follows on mount
  useEffect(() => {
    loadFollows()
  }, [loadFollows])

  return {
    rankings,
    myRank,
    isLoadingRankings,
    rankingSportFilter,
    setRankingSportFilter,
    rankingFilter,
    setRankingFilter,
    followedUsers,
    followLoading,
    handleFollow,
  }
}
