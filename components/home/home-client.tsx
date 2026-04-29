"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { MinimalHomeContent } from "@/components/minimal-sport/minimal-home-content"
import { MinimalShell } from "@/components/minimal-sport/minimal-shell"
import { MinimalTopbar } from "@/components/minimal-sport/minimal-topbar"
import { MinimalSidebar } from "@/components/minimal-sport/minimal-sidebar"
import { MinimalRightAside } from "@/components/minimal-sport/minimal-right-aside"
import { MinimalPrizeCard } from "@/components/minimal-sport/minimal-prize-card"
import { MinimalTalkList, type TalkItem } from "@/components/minimal-sport/minimal-talk-list"

const OnboardingBanner = dynamic(
  () => import("@/components/onboarding-banner").then((m) => ({ default: m.OnboardingBanner })),
  { ssr: false }
)
const HotPostToast = dynamic(
  () => import("@/components/home/hot-post-toast").then((m) => ({ default: m.HotPostToast })),
  { ssr: false }
)
const AnnouncementCarousel = dynamic(
  () =>
    import("@/components/home/announcement-carousel").then((m) => ({
      default: m.AnnouncementCarousel,
    })),
  { ssr: false }
)
const ContentSection = dynamic(
  () => import("@/components/home/content-section").then((m) => ({ default: m.ContentSection })),
  {
    loading: () => (
      <div className="min-h-[400px]">
        <div className="bg-card border-border animate-pulse rounded-lg border p-6">
          <div className="bg-muted mb-4 h-6 w-1/3 rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-20 rounded" />
            ))}
          </div>
        </div>
      </div>
    ),
    ssr: false,
  }
)

type TabType = "feed" | "content"

interface HomeClientProps {
  initialFeed: PostsResponse
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
  initialTab?: TabType
}

function groupCategoriesForSidebar(
  cats: Array<{
    slug: string
    name: string
    icon: string | null
    sort_order: number
    parent_slug: string | null
  }>
) {
  const parents = cats.filter((c) => !c.parent_slug)
  const sports = parents
    .filter((c) => c.sort_order <= 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  const life = parents
    .filter((c) => c.sort_order > 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  return { sports, life }
}

export function HomeClient({
  initialFeed,
  initialCategories,
  initialRecentComments,
  initialTab = "feed",
}: HomeClientProps) {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  useEffect(() => {
    const urlTab = searchParams.get("tab")
    if (urlTab === "content" || urlTab === "feed") {
      setActiveTab(urlTab)
    }
  }, [searchParams])
  const [sortBy, setSortBy] = useState<SortType>("hot")

  const { data: followsData, mutate: mutateFollows } = useSWR(
    isSignedIn ? "/api/community/follows" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )
  const followedCommunities = useMemo(() => {
    if (!isSignedIn) return new Set<string>()
    if (!followsData) return new Set<string>()
    return new Set<string>(
      (followsData.communities || []).map((c: { community_slug: string }) => c.community_slug)
    )
  }, [isSignedIn, followsData])
  const followsLoaded = !isSignedIn || !!followsData

  useEffect(() => {
    const handler = () => {
      mutateFollows()
    }
    window.addEventListener("communityFollowChanged", handler)
    return () => window.removeEventListener("communityFollowChanged", handler)
  }, [mutateFollows])

  const { posts, isLoading } = useFeed(sortBy, followedCommunities, followsLoaded, initialFeed)

  // ?tab=content 핸들러는 ContentTab 영역 내 탭 swap에서만 사용
  const handleSwitchToFeed = () => {
    setActiveTab("feed")
    router.replace("/", { scroll: false })
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" })
  }

  const talkItems = useMemo<TalkItem[]>(() => {
    const list = (initialRecentComments ?? []) as Array<{
      id: string
      title: string
      community_slug: string | null
      comment_count: number | null
    }>
    return list.map((t) => ({
      id: t.id,
      title: t.title,
      community_slug: t.community_slug,
      comment_count: t.comment_count,
    }))
  }, [initialRecentComments])

  const groupedCategories = useMemo(
    () =>
      (initialCategories ?? []) as Array<{
        id: number | string
        slug: string
        name: string
        icon: string | null
        sort_order: number
        parent_slug: string | null
      }>,
    [initialCategories]
  )

  const showOnboarding =
    isSignedIn && followedCommunities.size === 0 && followsLoaded && activeTab === "feed"

  // ?tab=content: 경기 분석글 — Minimal 셸 + 기존 ContentSection
  if (activeTab === "content") {
    const sidebarCats = groupCategories(groupedCategories)
    return (
      <>
        <MinimalShell
          topbar={<MinimalTopbar active="담벼락" />}
          sidebar={<MinimalSidebar sports={sidebarCats.sports} life={sidebarCats.life} />}
          aside={
            <MinimalRightAside>
              <MinimalPrizeCard />
              <MinimalTalkList items={talkItems} />
            </MinimalRightAside>
          }
        >
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSwitchToFeed}
              className="text-[13px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--ms-ink-3)" }}
            >
              ← 담벼락
            </button>
            <h1
              className="text-[24px] font-extrabold sm:text-[28px]"
              style={{ color: "var(--ms-ink)", letterSpacing: "-0.035em" }}
            >
              경기 분석글
            </h1>
          </div>
          <ContentSection />
        </MinimalShell>
      </>
    )
  }

  // 기본: feed 탭
  return (
    <>
      <MinimalHomeContent
        posts={posts}
        sortBy={sortBy}
        setSortBy={setSortBy}
        categories={groupedCategories}
        recentComments={talkItems}
        isLoading={isLoading}
        topBanner={<AnnouncementCarousel />}
        feedBanner={showOnboarding ? <OnboardingBanner /> : undefined}
      />
      {/* 실시간 인기글 토스트 — 로그인 + feed 탭. fixed positioning이라 셸 외부 렌더 OK */}
      {isSignedIn && <HotPostToast enabled followedSlugs={[...followedCommunities].sort()} />}
    </>
  )
}

// 작은 헬퍼 — content 탭에서 사이드바 그룹화에 사용
function groupCategories(
  cats: Array<{
    id: number | string
    slug: string
    name: string
    icon: string | null
    sort_order: number
    parent_slug: string | null
  }>
) {
  return groupCategoriesForSidebar(cats)
}
