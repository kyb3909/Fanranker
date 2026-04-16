"use client"

import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { Dices, Flame, Clock, FileText, Trophy } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { FeedSection } from "@/components/home/feed-section"

const CommunitySidebar = dynamic(
  () =>
    import("@/components/sidebar/community-sidebar").then((m) => ({ default: m.CommunitySidebar })),
  {
    loading: () => <div className="bg-card border-border h-96 animate-pulse rounded-lg border" />,
  }
)
const ActivitySidebar = dynamic(
  () =>
    import("@/components/sidebar/activity-sidebar").then((m) => ({ default: m.ActivitySidebar })),
  {
    loading: () => <div className="bg-card border-border h-96 animate-pulse rounded-lg border" />,
  }
)
const OnboardingBanner = dynamic(
  () => import("@/components/onboarding-banner").then((m) => ({ default: m.OnboardingBanner })),
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
const BettingPage = dynamic(() => import("@/components/betting/betting-page"), {
  loading: () => (
    <div className="min-h-[600px]">
      <div className="bg-card border-border rounded-lg border p-4">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-10 w-24 animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-muted h-8 w-16 animate-pulse rounded-full" />
          ))}
        </div>
      </div>
      <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border-border animate-pulse rounded-lg border p-4">
            <div className="bg-muted mb-2 h-4 w-1/4 rounded" />
            <div className="flex items-center justify-between">
              <div className="bg-muted h-6 w-1/3 rounded" />
              <div className="bg-muted h-8 w-12 rounded" />
              <div className="bg-muted h-6 w-1/3 rounded" />
            </div>
            <div className="mt-2 flex gap-2">
              <div className="bg-muted h-10 flex-1 rounded-lg" />
              <div className="bg-muted h-10 flex-1 rounded-lg" />
              <div className="bg-muted h-10 flex-1 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
})

type TabType = "feed" | "content"

interface HomeClientProps {
  initialFeed: PostsResponse
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
  initialBanners?: unknown[]
  isPredictionView: boolean
}

export function HomeClient({
  initialFeed,
  initialCategories,
  initialRecentComments,
  initialBanners,
  isPredictionView,
}: HomeClientProps) {
  const { isSignedIn } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>("feed")
  const [sortBy, setSortBy] = useState<SortType>("hot")

  // SWR로 팔로우 커뮤니티 로드 (community-sidebar와 캐시 공유)
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

  // 피드 데이터 훅 (서버에서 받은 초기 데이터 전달)
  const { posts, isLoading, isLoadingMore, loadMore } = useFeed(
    sortBy,
    followedCommunities,
    followsLoaded,
    initialFeed
  )

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab)
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" })
    }
  }

  return (
    <main
      id="main-content"
      className="mx-auto min-h-[80vh] max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
      tabIndex={-1}
    >
      <h1 className="sr-only">gongnori.fan — 스포츠 팬 커뮤니티</h1>
      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        {/* Left Sidebar */}
        <aside className="col-span-3 hidden lg:block">
          <CommunitySidebar initialCategories={initialCategories} />
        </aside>

        {/* Main Content */}
        <div className="col-span-12 space-y-4 lg:col-span-6">
          <AnnouncementCarousel initialBanners={initialBanners} />

          {isPredictionView ? (
            <BettingPage />
          ) : (
            <>
              {/* 탭 네비게이션 */}
              <div className="bg-card border-border overflow-hidden rounded-lg border">
                <div className="flex" role="tablist" aria-label="홈 탭">
                  <button
                    role="tab"
                    aria-selected={activeTab === "feed"}
                    onClick={() => handleTabClick("feed")}
                    className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-semibold transition-colors ${
                      activeTab === "feed"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileText className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    게시물
                    {activeTab === "feed" && (
                      <span className="bg-primary absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full" />
                    )}
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === "content"}
                    onClick={() => handleTabClick("content")}
                    className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-semibold transition-colors ${
                      activeTab === "content"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Trophy className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    경기 분석글
                    {activeTab === "content" && (
                      <span className="bg-primary absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full" />
                    )}
                  </button>
                </div>

                {activeTab === "feed" && (
                  <div className="border-border bg-muted/20 flex items-center justify-center border-t px-4 py-2.5">
                    <div
                      className="flex items-center gap-1.5 sm:gap-2"
                      role="group"
                      aria-label="게시물 정렬"
                    >
                      {[
                        { key: "random" as const, icon: Dices, label: "랜덤" },
                        { key: "hot" as const, icon: Flame, label: "온도순" },
                        { key: "new" as const, icon: Clock, label: "최신순" },
                      ].map(({ key, icon: Icon, label }) => (
                        <button
                          key={key}
                          onClick={() => setSortBy(key)}
                          aria-pressed={sortBy === key}
                          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-all sm:gap-2 sm:px-5 sm:text-[14px] ${
                            sortBy === key
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {activeTab === "feed" &&
                isSignedIn &&
                followedCommunities.size === 0 &&
                followsLoaded && <OnboardingBanner />}

              {activeTab === "feed" && (
                <div className="space-y-4">
                  <FeedSection
                    posts={posts}
                    isLoading={isLoading}
                    isLoadingMore={isLoadingMore}
                    loadMore={loadMore}
                  />
                </div>
              )}

              {activeTab === "content" && <ContentSection />}
            </>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="col-span-3 hidden lg:block">
          <ActivitySidebar showPrize initialRecentComments={initialRecentComments} />
        </aside>
      </div>
    </main>
  )
}
