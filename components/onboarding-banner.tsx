"use client"

import { useState, useEffect } from "react"
import { X, Star, Loader2 } from "lucide-react"
import Link from "next/link"
import { ALL_COMMUNITIES, type CommunityInfo } from "@/lib/constants/communities"
import { toast } from "@/hooks/use-toast"

const DISMISS_KEY = "onboarding-banner-dismissed"

interface PopularCommunity {
  community_slug: string
  followers: number
}

export function OnboardingBanner({ onFollowChange }: { onFollowChange?: () => void }) {
  const [dismissed, setDismissed] = useState(true) // 기본 숨김 → 체크 후 표시
  const [popular, setPopular] = useState<PopularCommunity[]>([])
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null)

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === "true"
    setDismissed(wasDismissed)

    if (!wasDismissed) {
      fetch("/api/community/popular")
        .then((r) => (r.ok ? r.json() : { communities: [] }))
        .then((data) => setPopular(data.communities || []))
        .catch(() => {})
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true")
    setDismissed(true)
  }

  const handleQuickFollow = async (slug: string) => {
    setLoadingSlug(slug)
    try {
      const res = await fetch(`/api/community/${slug}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ variant: "destructive", title: "오류", description: data.error || "팔로우에 실패했습니다." })
        return
      }
      setFollowingSet((prev) => new Set(prev).add(slug))
      // 홈 피드 갱신 알림
      window.dispatchEvent(
        new CustomEvent("communityFollowChanged", {
          detail: { slug, following: true, allSlugs: [slug] },
        })
      )
      onFollowChange?.()
    } catch {
      toast({ variant: "destructive", title: "오류", description: "처리 중 오류가 발생했습니다." })
    } finally {
      setLoadingSlug(null)
    }
  }

  if (dismissed) return null

  // 인기 게시판 목록 → community info 매핑
  const communityMap = new Map(ALL_COMMUNITIES.map((c) => [c.slug, c]))
  const topCommunities: (CommunityInfo & { followers: number })[] = popular
    .map((p) => {
      const info = communityMap.get(p.community_slug)
      return info ? { ...info, followers: p.followers } : null
    })
    .filter((c): c is CommunityInfo & { followers: number } => c !== null)
    .slice(0, 3)

  // API 데이터 없으면 기본 인기 게시판 3개 표시
  const displayCommunities =
    topCommunities.length > 0
      ? topCommunities
      : ALL_COMMUNITIES.slice(0, 3).map((c) => ({ ...c, followers: 0 }))

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted transition-colors"
        aria-label="닫기"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <p className="text-[14px] font-semibold text-foreground mb-1 pr-6">
        관심 있는 게시판을 팔로우해보세요
      </p>
      <p className="text-[12px] text-muted-foreground mb-3">
        팔로우하면 맞춤 피드를 볼 수 있어요. 지금은 전체 글이 표시됩니다.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {displayCommunities.map((community) => {
          const isFollowed = followingSet.has(community.slug)
          return (
            <button
              key={community.slug}
              onClick={() => !isFollowed && handleQuickFollow(community.slug)}
              disabled={loadingSlug === community.slug || isFollowed}
              aria-label={isFollowed ? `${community.name} 팔로우됨` : `${community.name} 팔로우`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                isFollowed
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground"
              }`}
            >
              {loadingSlug === community.slug ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <span>{community.emoji}</span>
                  <span>{community.name}</span>
                  {isFollowed ? (
                    <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                  ) : (
                    <Star className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      <Link
        href="/explore"
        className="text-[12px] text-primary hover:underline font-medium"
      >
        모든 게시판 보기 →
      </Link>
    </div>
  )
}
