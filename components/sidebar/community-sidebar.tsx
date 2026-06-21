"use client"

import { Input } from "@/components/ui/input"
import { useState, useMemo, memo } from "react"
import { useAuth } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { Star, Search, Loader2, LayoutGrid, ChevronRight } from "lucide-react"
import type { CommunityInfo } from "@/lib/constants/communities"
import { toast } from "@/hooks/use-toast"
import { AdPlaceholder } from "@/components/sidebar/ad-placeholder"
import { SidebarResources } from "./sidebar-resources"
import { BoardIcon } from "./board-icon"
import { useStickySidebar } from "@/hooks/use-sticky-sidebar"
import useSWR, { useSWRConfig } from "swr"
import { fetcher } from "@/lib/swr"

interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
  parent_slug: string | null
}

const CATEGORY_PASTEL: Record<string, string> = {
  축구: "#FDECEC",
  야구: "#EAF1FD",
  농구: "#FDF1E5",
  배구: "#F4EEFB",
  게임: "#EEF0FA",
  애니: "#EAF4F4",
  음악: "#FDEFF3",
}
function getCategoryChipBg(name: string): string {
  return CATEGORY_PASTEL[name] ?? "var(--secondary, #F6E4E8)"
}

/** 게시판 라인 아이콘 색 — 파스텔 bg 와 톤 맞춘 진한 액센트. 미지정(영화/아이돌/자유/채널)은 와인. */
const CATEGORY_ICON_COLOR: Record<string, string> = {
  축구: "#9F1239",
  야구: "#1E3A8A",
  농구: "#9A3412",
  배구: "#581C87",
  게임: "#2D3A8C",
  애니: "#0F5858",
  음악: "#9F1239",
}
function getCategoryIconColor(name: string): string {
  return CATEGORY_ICON_COLOR[name] ?? "var(--wc-burgundy)"
}

export const CommunitySidebar = memo(function CommunitySidebar({
  initialCategories,
}: {
  initialCategories?: unknown[]
}) {
  const { isSignedIn } = useAuth()
  const { mutate: globalMutate } = useSWRConfig()
  const { ref: stickyRef, stickyTop } = useStickySidebar()
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  // DB categories 기반 게시판 목록
  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: !initialCategories,
    dedupingInterval: 60000,
    fallbackData: initialCategories ? { categories: initialCategories as Category[] } : undefined,
  })

  const { parentCategories, channelMap, sportsCommunities, lifeCommunities, allCommunities } =
    useMemo(() => {
      const cats = catData?.categories || []
      // 상위 카테고리 (parent_slug가 null)
      const parents = cats.filter((c) => !c.parent_slug)
      // 채널 맵: parent_slug → 하위 채널 배열
      const chMap = new Map<string, Category[]>()
      cats
        .filter((c) => c.parent_slug)
        .forEach((c) => {
          const list = chMap.get(c.parent_slug!) || []
          list.push(c)
          chMap.set(c.parent_slug!, list)
        })

      const toInfo = (c: Category): CommunityInfo => ({
        slug: c.slug,
        name: c.name,
        emoji: c.icon || "",
        description: c.description || "",
      })

      const sports = parents.filter((c) => c.sort_order <= 4).map(toInfo)
      const life = parents.filter((c) => c.sort_order > 4).map(toInfo)
      const all = parents.map(toInfo)

      return {
        parentCategories: parents,
        channelMap: chMap,
        sportsCommunities: sports,
        lifeCommunities: life,
        allCommunities: all,
      }
    }, [catData])

  // SWR로 팔로우 커뮤니티 로드
  const { data: followsData } = useSWR(isSignedIn ? "/api/community/follows" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  const followedCommunities = useMemo(() => {
    if (!followsData) return new Set<string>()
    return new Set<string>(
      (followsData.communities || []).map((c: { community_slug: string }) => c.community_slug)
    )
  }, [followsData])
  const loadingFollows = isSignedIn ? !followsData : false

  // 현재 보고 있는 채널의 부모를 자동 펼침
  useMemo(() => {
    const currentSlug = pathname.startsWith("/community/") ? pathname.split("/")[2] : null
    if (!currentSlug) return
    // 현재 slug가 채널인지 확인
    const cats = catData?.categories || []
    const current = cats.find((c) => c.slug === currentSlug)
    if (current?.parent_slug) {
      setExpandedParents((prev) => new Set([...prev, current.parent_slug!]))
    }
  }, [pathname, catData])

  const toggleExpand = (slug: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

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
      globalMutate("/api/community/follows")
      window.dispatchEvent(
        new CustomEvent("communityFollowChanged", {
          detail: { slug: communitySlug, following: data.following },
        })
      )
    } catch {
      toast({ variant: "destructive", title: "오류", description: "처리 중 오류가 발생했습니다." })
    } finally {
      setTogglingSlug(null)
    }
  }

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen)
    if (isSearchOpen) setSearchQuery("")
  }

  // 검색: 상위 + 채널 모두 포함
  const filteredCommunities = useMemo(() => {
    if (!searchQuery) return []
    const cats = catData?.categories || []
    return cats
      .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        emoji: c.icon || "",
        description: c.description || "",
        parentSlug: c.parent_slug,
      }))
  }, [searchQuery, catData])

  const renderCommunityRow = (community: CommunityInfo, isFollowed: boolean, isChannel = false) => (
    <div
      key={community.slug}
      className={`hover:bg-muted/40 group relative flex items-center justify-between transition-colors ${
        isChannel ? "py-2 pr-4 pl-10" : "px-4 py-2.5"
      }`}
    >
      {/* 행 전체를 덮는 클릭 영역 → 게시판 진입 (별 버튼은 위에서 제외) */}
      <Link
        href={`/community/${community.slug}`}
        className="absolute inset-0"
        aria-label={`${community.name} 게시판`}
      />
      <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`flex shrink-0 items-center justify-center rounded ${
            isChannel ? "h-6 w-6" : "h-7 w-7"
          }`}
          style={{
            background: getCategoryChipBg(community.name),
            color: getCategoryIconColor(community.name),
          }}
        >
          <BoardIcon
            slug={community.slug}
            className={isChannel ? "h-4 w-4" : "h-[18px] w-[18px]"}
          />
        </span>
        <span
          className={`text-foreground group-hover:text-primary truncate font-medium ${
            isChannel ? "text-[13px]" : "text-[14px]"
          }`}
        >
          {community.name}
        </span>
      </span>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggleFollow(community.slug)
        }}
        disabled={togglingSlug === community.slug}
        className="hover:bg-muted relative z-10 flex-shrink-0 rounded-lg p-2 disabled:opacity-50"
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

  const renderParentWithChannels = (community: CommunityInfo) => {
    const channels = channelMap.get(community.slug)
    const hasChannels = channels && channels.length > 0
    const isExpanded = expandedParents.has(community.slug)

    return (
      <div key={community.slug}>
        <div className="hover:bg-muted/40 group flex items-center justify-between px-4 py-2.5 transition-colors">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* 채널이 있으면 펼침 버튼 */}
            {hasChannels ? (
              <button
                onClick={() => toggleExpand(community.slug)}
                className="flex items-center gap-3"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
                  style={{
                    background: getCategoryChipBg(community.name),
                    color: getCategoryIconColor(community.name),
                  }}
                >
                  <BoardIcon slug={community.slug} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-foreground group-hover:text-primary text-[14px] font-medium">
                  {community.name}
                </span>
                <ChevronRight
                  className={`text-muted-foreground h-3.5 w-3.5 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              </button>
            ) : (
              <Link href={`/community/${community.slug}`} className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
                  style={{
                    background: getCategoryChipBg(community.name),
                    color: getCategoryIconColor(community.name),
                  }}
                >
                  <BoardIcon slug={community.slug} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-foreground group-hover:text-primary truncate text-[14px] font-medium">
                  {community.name}
                </span>
              </Link>
            )}
          </div>
          <button
            onClick={(e) => {
              e.preventDefault()
              toggleFollow(community.slug)
            }}
            disabled={togglingSlug === community.slug}
            className="hover:bg-muted flex-shrink-0 rounded-lg p-2 disabled:opacity-50"
            aria-label={followedCommunities.has(community.slug) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            {togglingSlug === community.slug ? (
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            ) : (
              <Star
                className={`h-4 w-4 ${followedCommunities.has(community.slug) ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-primary"}`}
              />
            )}
          </button>
        </div>

        {/* 하위 채널 */}
        {hasChannels && isExpanded && (
          <div className="bg-muted/20">
            {/* 종목 일반 게시판 링크 */}
            <div className="hover:bg-muted/40 group flex items-center justify-between py-2 pr-4 pl-10 transition-colors">
              <Link
                href={`/community/${community.slug}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{
                    background: getCategoryChipBg(community.name),
                    color: getCategoryIconColor(community.name),
                  }}
                >
                  <BoardIcon slug={community.slug} className="h-4 w-4" />
                </span>
                <span className="text-foreground group-hover:text-primary truncate text-[13px] font-medium">
                  {community.name} 일반
                </span>
              </Link>
            </div>
            {channels.map((ch) =>
              renderCommunityRow(
                {
                  slug: ch.slug,
                  name: ch.name,
                  emoji: ch.icon || "",
                  description: ch.description || "",
                },
                followedCommunities.has(ch.slug),
                true
              )
            )}
          </div>
        )}
      </div>
    )
  }

  const renderGroup = (label: string, communities: CommunityInfo[]) => (
    <>
      <p className="text-muted-foreground px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      {communities.map((community) => renderParentWithChannels(community))}
    </>
  )

  return (
    <div ref={stickyRef} className="sticky flex flex-col gap-4" style={{ top: `${stickyTop}px` }}>
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          background: "var(--wc-card)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: "var(--wc-card)",
            borderBottom: "1px solid var(--wc-line)",
          }}
        >
          <h3
            className="flex items-center gap-2 text-[11px] font-bold uppercase"
            style={{
              color: "var(--wc-ink)",
              letterSpacing: "0.18em",
            }}
          >
            <LayoutGrid className="h-3.5 w-3.5" style={{ color: "var(--wc-burgundy)" }} />
            게시판
          </h3>
          <button
            onClick={toggleSearch}
            className="rounded-lg p-1.5 transition-colors"
            aria-label="게시판 검색"
            style={{
              color: isSearchOpen ? "var(--wc-burgundy)" : "var(--wc-mute)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--wc-card)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        {isSearchOpen && (
          <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--wc-line)" }}>
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--wc-mute)" }}
              />
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
          {!loadingFollows && isSignedIn && followedCommunities.size === 0 && !searchQuery && (
            <div className="mb-1 px-4 py-2.5">
              <p className="text-primary mb-1.5 text-[12px] font-semibold">인기 게시판</p>
              <p className="text-muted-foreground text-[12px]">
                별을 눌러 팔로우하면 내 담벼락이 더 알차져요
              </p>
            </div>
          )}
          {searchQuery ? (
            filteredCommunities.length > 0 ? (
              filteredCommunities.map((c) =>
                renderCommunityRow(
                  { slug: c.slug, name: c.name, emoji: c.emoji, description: c.description },
                  followedCommunities.has(c.slug),
                  !!c.parentSlug
                )
              )
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-muted-foreground text-[13px]">검색 결과가 없습니다</p>
              </div>
            )
          ) : (
            <>
              {sportsCommunities.length > 0 && renderGroup("스포츠", sportsCommunities)}
              {lifeCommunities.length > 0 && (
                <>
                  <div className="my-1 border-t" />
                  {renderGroup("라이프", lifeCommunities)}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <AdPlaceholder variant="sidebar" />

      <SidebarResources />
    </div>
  )
})

CommunitySidebar.displayName = "CommunitySidebar"
