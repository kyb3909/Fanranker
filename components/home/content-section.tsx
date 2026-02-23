"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import { useIdentity } from "@/components/identity-provider"
import { PredictionActivityCard } from "@/components/prediction-activity-card"
import { Loader2, Trophy, Palette, Heart, Eye, MessageSquare } from "lucide-react"
import Link from "next/link"
import { formatCount } from "@/lib/utils/format"

// --- 문화 피드용 Mock 아트워크 ---
const GRADIENTS = [
  "from-zinc-800 via-neutral-700 to-stone-800",
  "from-red-950 via-rose-900 to-red-950",
  "from-slate-800 via-slate-700 to-zinc-800",
  "from-stone-800 via-neutral-700 to-stone-900",
  "from-neutral-800 via-zinc-700 to-neutral-900",
  "from-red-900/80 via-stone-800 to-neutral-800",
  "from-zinc-700 via-stone-700 to-neutral-800",
  "from-stone-900 via-zinc-800 to-stone-900",
]

interface FeedArtwork {
  id: string
  title: string
  artist: string
  artistAvatar: string
  likes: number
  views: number
  comments: number
  gradient: string
  aspectRatio: number
}

const MOCK_FOLLOWED_ARTWORKS: FeedArtwork[] = [
  { id: "1", title: "숲속의 수호자", artist: "ArtistKim", artistAvatar: "K", likes: 342, views: 1820, comments: 28, gradient: GRADIENTS[0], aspectRatio: 1.4 },
  { id: "3", title: "사이버 전사", artist: "NeonDraw", artistAvatar: "N", likes: 489, views: 2650, comments: 42, gradient: GRADIENTS[2], aspectRatio: 1.2 },
  { id: "5", title: "드래곤 나이트", artist: "FantasyKing", artistAvatar: "F", likes: 612, views: 3200, comments: 56, gradient: GRADIENTS[4], aspectRatio: 1.5 },
  { id: "7", title: "마법소녀 변신", artist: "MagicPen", artistAvatar: "M", likes: 445, views: 2100, comments: 38, gradient: GRADIENTS[6], aspectRatio: 1.3 },
  { id: "10", title: "달빛 아래 여우", artist: "MoonlitArt", artistAvatar: "M", likes: 523, views: 2800, comments: 45, gradient: GRADIENTS[7], aspectRatio: 1.25 },
  { id: "13", title: "엘프 궁수", artist: "FantasyKing", artistAvatar: "F", likes: 378, views: 1900, comments: 31, gradient: GRADIENTS[0], aspectRatio: 1.35 },
  { id: "17", title: "사무라이 혼", artist: "BushidoArt", artistAvatar: "B", likes: 534, views: 2900, comments: 48, gradient: GRADIENTS[3], aspectRatio: 1.0 },
  { id: "15", title: "전투 메카", artist: "MechaPilot", artistAvatar: "M", likes: 412, views: 2300, comments: 35, gradient: GRADIENTS[5], aspectRatio: 1.15 },
]

function FeedArtworkCard({ artwork }: { artwork: FeedArtwork }) {
  return (
    <div className="break-inside-avoid mb-2 sm:mb-3 group">
      <Link href={`/art/${artwork.id}`} className="block">
        <div className="relative overflow-hidden rounded-lg cursor-pointer">
          <div
            className={`relative bg-gradient-to-br ${artwork.gradient} w-full`}
            style={{ paddingBottom: `${artwork.aspectRatio * 100}%` }}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <Palette className="w-12 h-12 text-white" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white font-semibold text-[13px] leading-tight line-clamp-1 drop-shadow-sm">{artwork.title}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-5 h-5 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-[9px] text-white font-bold">
                    {artwork.artistAvatar}
                  </div>
                  <span className="text-white/90 text-xs drop-shadow-sm">{artwork.artist}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-white/80">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Heart className="h-3 w-3" />
                    {formatCount(artwork.likes)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <Eye className="h-3 w-3" />
                    {formatCount(artwork.views)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <MessageSquare className="h-3 w-3" />
                    {artwork.comments}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}

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
  predictions: { id: string; game_id: string; prediction: string; status: string; game: { home_team_name: string; away_team_name: string; match_time: string; game_type: string; sport: string; result: string | null } }[] | null
}

export function ContentSection() {
  const { isSignedIn } = useAuth()
  const { identity } = useIdentity()
  const [activities, setActivities] = useState<Activity[]>([])
  const [isContentLoading, setIsContentLoading] = useState(false)
  const [contentLoaded, setContentLoaded] = useState(false)

  // 아이덴티티 변경 시 리셋
  useEffect(() => {
    setContentLoaded(false)
  }, [identity])

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
    if (!contentLoaded && (identity === "sports" || identity === "hybrid")) {
      fetchActivities()
    }
    if (identity === "culture") {
      setContentLoaded(true)
    }
  }, [contentLoaded, fetchActivities, identity])

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
      {/* 스포츠: 승부 예측 */}
      {(identity === "sports" || identity === "hybrid") && (
        <>
          {!isSignedIn ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">
                로그인하면 팔로우한 랭커의 예측 콘텐츠를 확인할 수 있습니다.
              </p>
            </div>
          ) : isContentLoading ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">예측 콘텐츠를 불러오는 중...</p>
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
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                랭커를 팔로우하면 예측 콘텐츠가 여기에 표시됩니다
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                승부예측 랭킹에서 랭커를 팔로우해보세요.
              </p>
              <Link
                href="/games/prediction"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Trophy className="w-4 h-4" />
                랭킹 보러 가기
              </Link>
            </div>
          )}
        </>
      )}

      {/* 하이브리드: 구분선 */}
      {identity === "hybrid" && (
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-muted-foreground font-medium">구독 아티스트</span>
          <div className="flex-1 border-t border-border" />
        </div>
      )}

      {/* 문화 / 하이브리드: 구독 아티스트 */}
      {(identity === "culture" || identity === "hybrid") && (
        <>
          {!isSignedIn ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">
                로그인하면 구독한 아티스트의 작품을 확인할 수 있습니다.
              </p>
            </div>
          ) : MOCK_FOLLOWED_ARTWORKS.length > 0 ? (
            <div className="columns-2 gap-2 sm:gap-3">
              {MOCK_FOLLOWED_ARTWORKS.map((artwork) => (
                <FeedArtworkCard key={artwork.id} artwork={artwork} />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <Palette className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                아티스트를 팔로우하면 작품이 여기에 표시됩니다
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                아트 갤러리에서 마음에 드는 아티스트를 팔로우해보세요.
              </p>
              <Link
                href="/art"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Palette className="w-4 h-4" />
                아트 갤러리 가기
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
