"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import { PredictionActivityCard } from "@/components/prediction-activity-card"
import { Loader2, Trophy } from "lucide-react"
import Link from "next/link"

interface Activity {
  id: string
  user_id: string
  round_id: string
  sport: string
  prediction_count: number
  created_at: string
  profile: { nickname: string; avatar_url: string | null }
  stats: { accuracy: number; net_profit: number; current_streak: number } | null
  round: { year: number; round: number; status: string } | null
  is_purchased: boolean
  is_free?: boolean
  predictions:
    | {
        id: string
        game_id: string
        prediction: string
        status: string
        game: {
          home_team_name: string
          away_team_name: string
          match_time: string
          game_type: string
          sport: string
          result: string | null
        }
      }[]
    | null
  slipGroups?:
    | {
        slipId: string
        sport: string
        date: string
        status: string
        stake: number
        totalOdds: number
        profit: number
        matches: {
          league: string
          home: string
          away: string
          selection: string
          odds: number
          result: string
        }[]
      }[]
    | null
}

export function ContentSection() {
  const { isSignedIn } = useAuth()
  const [activities, setActivities] = useState<Activity[]>([])
  const [isContentLoading, setIsContentLoading] = useState(false)
  const [contentLoaded, setContentLoaded] = useState(false)

  const fetchActivities = useCallback(async () => {
    if (!isSignedIn) return
    setIsContentLoading(true)
    try {
      const response = await fetch("/api/feed/predictions?limit=20")
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
      }
    } catch {
      setActivities([])
    } finally {
      setIsContentLoading(false)
      setContentLoaded(true)
    }
  }, [isSignedIn])

  useEffect(() => {
    if (!contentLoaded) {
      fetchActivities()
    }
  }, [contentLoaded, fetchActivities])

  const handlePurchase = async (activityId: string) => {
    try {
      const response = await fetch("/api/predictions/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_id: activityId }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || "구매에 실패했습니다.")
        return null
      }
      if (!data.is_free) {
        window.dispatchEvent(new Event("goldBalanceUpdate"))
      }
      return data.predictions || null
    } catch {
      alert("구매 중 오류가 발생했습니다.")
      return null
    }
  }

  return (
    <div className="space-y-3">
      {!isSignedIn ? (
        <div className="bg-card border-border rounded-lg border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            로그인하면 팔로우한 랭커의 예측 콘텐츠를 확인할 수 있습니다.
          </p>
        </div>
      ) : isContentLoading ? (
        <div className="bg-card border-border rounded-lg border p-8 text-center">
          <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">예측 콘텐츠를 불러오는 중...</p>
        </div>
      ) : activities.length > 0 ? (
        activities.map((activity) => (
          <PredictionActivityCard
            key={activity.id}
            activity={activity}
            onPurchase={handlePurchase}
          />
        ))
      ) : (
        <div className="bg-card border-border rounded-lg border p-8 text-center">
          <Trophy className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
          <p className="text-muted-foreground mb-2 text-sm">
            랭커를 팔로우하면 예측 콘텐츠가 여기에 표시됩니다
          </p>
          <p className="text-muted-foreground mb-4 text-xs">
            승부예측 랭킹에서 랭커를 팔로우해보세요.
          </p>
          <Link
            href="/games/prediction"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Trophy className="h-4 w-4" />
            랭킹 보러 가기
          </Link>
        </div>
      )}
    </div>
  )
}
