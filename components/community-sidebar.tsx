"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useMemo, memo } from "react"
import { useAuth } from "@clerk/nextjs"
import Link from "next/link"
import { Star, Search, BookOpen, Loader2, LayoutGrid } from "lucide-react"
import type { CommunityInfo } from "@/lib/constants/communities"
import { toast } from "@/hooks/use-toast"
import { AdPlaceholder } from "@/components/ad-placeholder"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
}

export const CommunitySidebar = memo(function CommunitySidebar() {
  const { isSignedIn } = useAuth()
  const [followedCommunities, setFollowedCommunities] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [loadingFollows, setLoadingFollows] = useState(true)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)

  // DB categories 기반 게시판 목록
  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  const { allCommunities, sportsCommunities, lifeCommunities } = useMemo(() => {
    const cats = catData?.categories || []
    const mapped: CommunityInfo[] = cats.map((c) => ({
      slug: c.slug,
      name: c.name,
      emoji: c.icon || "📋",
    }))
    // sort_order ≤ 4 = 스포츠, > 4 = 라이프
    const sports = cats
      .filter((c) => c.sort_order <= 4)
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        emoji: c.icon || "📋",
      }))
    const life = cats
      .filter((c) => c.sort_order > 4)
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        emoji: c.icon || "📋",
      }))
    return { allCommunities: mapped, sportsCommunities: sports, lifeCommunities: life }
  }, [catData])

  // 서버에서 팔로우한 커뮤니티 목록 로드
  useEffect(() => {
    if (!isSignedIn) {
      setLoadingFollows(false)
      return
    }
    let cancelled = false
    setLoadingFollows(true)
    fetch("/api/community/follows")
      .then((res) => {
        if (!res.ok) return { communities: [] }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const slugs = new Set<string>(
          (data.communities || []).map((c: { community_slug: string }) => c.community_slug)
        )
        setFollowedCommunities(slugs)
      })
      .catch(() => {
        if (!cancelled) setFollowedCommunities(new Set())
      })
      .finally(() => {
        if (!cancelled) setLoadingFollows(false)
      })
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  const toggleFollow = async (communitySlug: string) => {
    const isFollowed = followedCommunities.has(communitySlug)
    setTogglingSlug(communitySlug)
    try {
      const res = await fetch(`/api/community/${communitySlug}/follow`, {
        method: isFollowed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          toast({
            variant: "destructive",
            title: "로그인 필요",
            description: "로그인 후 즐겨찾기를 사용할 수 있습니다.",
          })
        } else {
          toast({
            variant: "destructive",
            title: "오류",
            description: data.error || "처리에 실패했습니다.",
          })
        }
        return
      }
      setFollowedCommunities((prev) => {
        const next = new Set(prev)
        if (data.following) {
          next.add(communitySlug)
        } else {
          next.delete(communitySlug)
        }
        // 홈 피드 등 다른 컴포넌트에 팔로우 변경 알림
        window.dispatchEvent(
          new CustomEvent("communityFollowChanged", {
            detail: { slug: communitySlug, following: data.following, allSlugs: Array.from(next) },
          })
        )
        return next
      })
    } catch {
      toast({ variant: "destructive", title: "오류", description: "처리 중 오류가 발생했습니다." })
    } finally {
      setTogglingSlug(null)
    }
  }

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen)
    if (isSearchOpen) {
      setSearchQuery("") // 검색 닫을 때 검색어 초기화
    }
  }

  // 검색어로 커뮤니티 필터링
  const filteredCommunities = useMemo(
    () =>
      allCommunities.filter((community) =>
        community.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [searchQuery, allCommunities]
  )

  const renderCommunityRow = (community: CommunityInfo, isFollowed: boolean) => (
    <div
      key={community.slug}
      className="hover:bg-muted/40 group flex items-center justify-between px-4 py-2.5 transition-colors"
    >
      <Link
        href={`/community/${community.slug}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="bg-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded text-base">
          {community.emoji}
        </span>
        <span className="text-foreground group-hover:text-primary truncate text-[14px] font-medium">
          {community.name}
        </span>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault()
          toggleFollow(community.slug)
        }}
        disabled={togglingSlug === community.slug}
        className="hover:bg-muted flex-shrink-0 rounded-lg p-1.5 disabled:opacity-50"
        aria-label={isFollowed ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      >
        {togglingSlug === community.slug ? (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        ) : (
          <Star
            className={`h-4 w-4 ${isFollowed ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-primary"}`}
          />
        )}
      </button>
    </div>
  )

  return (
    <div className="sticky top-16 flex flex-col gap-4">
      {/* ===== 게시판 (왼쪽 사이드바) ===== */}
      <Card className="bg-card border-border gap-0 overflow-hidden rounded-xl border py-0 shadow-none">
        <div className="bg-primary/10 border-border flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-primary flex items-center gap-2 text-[14px] font-bold">
            <LayoutGrid className="h-4 w-4" />
            게시판
          </h3>
          <button
            onClick={toggleSearch}
            className="hover:bg-muted rounded-lg p-1.5 transition-colors"
            aria-label="게시판 검색"
          >
            <Search
              className={`h-4 w-4 ${isSearchOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            />
          </button>
        </div>
        {isSearchOpen && (
          <div className="border-border border-b px-4 py-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="게시판 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-[13px]"
                autoFocus
              />
            </div>
          </div>
        )}
        <div className="py-1">
          {/* 팔로우 0개 + 검색 안 하는 중일 때: 인기 게시판 하이라이트 */}
          {!loadingFollows && isSignedIn && followedCommunities.size === 0 && !searchQuery && (
            <div className="mb-1 px-4 py-2.5">
              <p className="text-primary mb-1.5 text-[12px] font-semibold">인기 게시판</p>
              <p className="text-muted-foreground text-[12px]">
                ⭐ 별을 눌러 팔로우하면 맞춤 피드를 볼 수 있어요
              </p>
            </div>
          )}
          {searchQuery ? (
            // 검색 중: 그룹 구분 없이 flat 리스트
            filteredCommunities.length > 0 ? (
              filteredCommunities.map((community) =>
                renderCommunityRow(community, followedCommunities.has(community.slug))
              )
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-muted-foreground text-[13px]">검색 결과가 없습니다</p>
              </div>
            )
          ) : (
            // 기본: 스포츠 / 라이프 그룹 구분
            <>
              {sportsCommunities.length > 0 && (
                <>
                  <p className="text-muted-foreground px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
                    스포츠
                  </p>
                  {sportsCommunities.map((community) =>
                    renderCommunityRow(community, followedCommunities.has(community.slug))
                  )}
                </>
              )}
              {lifeCommunities.length > 0 && (
                <>
                  <div className="border-border/40 my-1 border-t" />
                  <p className="text-muted-foreground px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
                    라이프
                  </p>
                  {lifeCommunities.map((community) =>
                    renderCommunityRow(community, followedCommunities.has(community.slug))
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Card>

      {/* 광고 플레이스홀더 */}
      <AdPlaceholder variant="sidebar" />

      {/* 3. 리소스 (사이트맵 하단) */}
      <nav className="mt-auto shrink-0">
        <Card className="bg-card border-border gap-0 overflow-hidden rounded-xl border py-0 shadow-none">
          <div className="bg-primary/10 border-border border-b px-4 py-3">
            <h3 className="text-primary flex items-center gap-2 text-[14px] font-bold">
              <BookOpen className="h-4 w-4" />
              리소스
            </h3>
          </div>
          <div className="py-1">
            <Link
              href="/about"
              className="hover:bg-muted/40 group text-foreground group-hover:text-primary flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition-colors"
            >
              회사 소개
            </Link>
            <Link
              href="/terms"
              className="hover:bg-muted/40 group text-foreground group-hover:text-primary flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition-colors"
            >
              이용약관
            </Link>
            <Link
              href="/content-policy"
              className="hover:bg-muted/40 group text-foreground group-hover:text-primary flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition-colors"
            >
              게시물 운영정책
            </Link>
            <Link
              href="/privacy"
              className="hover:bg-muted/40 group text-foreground group-hover:text-primary flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-medium transition-colors"
            >
              개인정보처리방침
            </Link>
          </div>
        </Card>
      </nav>
    </div>
  )
})

CommunitySidebar.displayName = "CommunitySidebar"
