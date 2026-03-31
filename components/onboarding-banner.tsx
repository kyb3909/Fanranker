"use client"

import { useState, useEffect } from "react"
import { X, Star, Loader2, Trophy, Pencil, ArrowRight } from "lucide-react"
import Link from "@/components/ui/app-link"
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
        toast({
          variant: "destructive",
          title: "오류",
          description: data.error || "팔로우에 실패했습니다.",
        })
        return
      }
      setFollowingSet((prev) => new Set(prev).add(slug))
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
    .slice(0, 4)

  const displayCommunities =
    topCommunities.length > 0
      ? topCommunities
      : ALL_COMMUNITIES.slice(0, 4).map((c) => ({ ...c, followers: 0 }))

  return (
    <div className="border-primary/20 from-primary/8 via-card to-primary/4 relative overflow-hidden rounded-xl border bg-gradient-to-br">
      <div className="via-primary/60 h-[2px] bg-gradient-to-r from-transparent to-transparent" />
      <button
        onClick={handleDismiss}
        className="hover:bg-muted absolute top-3 right-3 rounded-lg p-1 transition-colors"
        aria-label="닫기"
      >
        <X className="text-muted-foreground h-4 w-4" />
      </button>

      <div className="p-4">
        <p className="text-foreground mb-3 pr-6 text-[15px] font-bold">
          FanRanker에서 이런 걸 할 수 있어요
        </p>

        {/* 3가지 핵심 기능 카드 */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {/* 1. 게시판 팔로우 */}
          <div className="border-border bg-card/80 rounded-lg border p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="from-primary/20 to-primary/5 flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br">
                <Star className="text-primary h-3.5 w-3.5" />
              </span>
              <span className="text-foreground text-[13px] font-semibold">맞춤 담벼락</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              관심 게시판을 팔로우하고 나만의 담벼락을 만들어보세요
            </p>
          </div>

          {/* 2. 승부예측 */}
          <Link
            href="/?view=prediction"
            className="group border-border bg-card/80 hover:border-primary/30 rounded-lg border p-3 transition-colors"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="from-primary/20 to-primary/5 flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br">
                <Trophy className="text-primary h-3.5 w-3.5" />
              </span>
              <span className="text-foreground text-[13px] font-semibold">승부예측</span>
              <ArrowRight className="text-muted-foreground ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              매일 무료 볼로 경기 결과를 예측하고 랭킹에 도전하세요
            </p>
          </Link>

          {/* 3. 글쓰기 */}
          <Link
            href="/write"
            className="group border-border bg-card/80 hover:border-primary/30 rounded-lg border p-3 transition-colors"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="from-primary/20 to-primary/5 flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br">
                <Pencil className="text-primary h-3.5 w-3.5" />
              </span>
              <span className="text-foreground text-[13px] font-semibold">커뮤니티</span>
              <ArrowRight className="text-muted-foreground ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              좋아하는 주제의 게시판에서 자유롭게 글을 작성하세요
            </p>
          </Link>
        </div>

        {/* 빠른 팔로우 */}
        <div className="border-border/50 bg-muted/30 rounded-lg border p-3">
          <p className="text-muted-foreground mb-2 text-[12px] font-semibold">
            인기 게시판 바로 팔로우
          </p>
          <div className="flex flex-wrap gap-2">
            {displayCommunities.map((community) => {
              const isFollowed = followingSet.has(community.slug)
              return (
                <button
                  key={community.slug}
                  onClick={() => !isFollowed && handleQuickFollow(community.slug)}
                  disabled={loadingSlug === community.slug || isFollowed}
                  aria-label={
                    isFollowed ? `${community.name} 팔로우됨` : `${community.name} 팔로우`
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                    isFollowed
                      ? "border-primary/30 bg-primary/10 text-primary border"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5 border"
                  }`}
                >
                  {loadingSlug === community.slug ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>{community.emoji}</span>
                      <span>{community.name}</span>
                      {isFollowed ? (
                        <Star className="fill-primary text-primary h-3.5 w-3.5" />
                      ) : (
                        <Star className="text-muted-foreground h-3.5 w-3.5" />
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
