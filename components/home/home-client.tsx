"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { MinimalHomeContent, type HomeTab } from "@/components/minimal-sport/minimal-home-content"
import type { TalkItem } from "@/components/minimal-sport/minimal-talk-list"

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
        <div
          className="animate-pulse rounded-2xl border bg-[var(--ms-surface)] p-6"
          style={{ borderColor: "var(--ms-line)" }}
        >
          <div className="mb-4 h-6 w-1/3 rounded bg-[var(--ms-bg-hover)]" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded bg-[var(--ms-bg-hover)]" />
            ))}
          </div>
        </div>
      </div>
    ),
    ssr: false,
  }
)

interface HomeClientProps {
  initialFeed: PostsResponse
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
  initialTab?: HomeTab
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
  const [activeTab, setActiveTab] = useState<HomeTab>(initialTab)

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

  const handleTabChange = (tab: HomeTab) => {
    setActiveTab(tab)
    const nextUrl = tab === "content" ? "/?tab=content" : "/"
    router.replace(nextUrl, { scroll: false })
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

  return (
    <>
      <MinimalHomeContent
        posts={posts}
        sortBy={sortBy}
        setSortBy={setSortBy}
        categories={groupedCategories}
        recentComments={talkItems}
        isLoading={isLoading}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        contentTabSlot={<ContentSection />}
        topBanner={<AnnouncementCarousel />}
        feedBanner={showOnboarding ? <OnboardingBanner /> : undefined}
      />
      {/* 실시간 인기글 토스트 — 로그인 + feed 탭. fixed positioning이라 셸 외부 렌더 OK */}
      {isSignedIn && activeTab === "feed" && (
        <HotPostToast enabled followedSlugs={[...followedCommunities].sort()} />
      )}
    </>
  )
}
