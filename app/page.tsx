"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"

const CommunitySidebar = dynamic(
  () => import("@/components/community-sidebar").then((m) => ({ default: m.CommunitySidebar })),
  {
    ssr: false,
    loading: () => <div className="bg-card border-border h-96 animate-pulse rounded-xl border" />,
  }
)
const ActivitySidebar = dynamic(
  () => import("@/components/activity-sidebar").then((m) => ({ default: m.ActivitySidebar })),
  {
    ssr: false,
    loading: () => <div className="bg-card border-border h-96 animate-pulse rounded-xl border" />,
  }
)
import { Dices, Flame, Clock, Newspaper, Trophy } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
const OnboardingBanner = dynamic(
  () => import("@/components/onboarding-banner").then((m) => ({ default: m.OnboardingBanner })),
  {
    ssr: false,
  }
)
import { FeedSection } from "@/components/home/feed-section"

const ContentSection = dynamic(
  () => import("@/components/home/content-section").then((m) => ({ default: m.ContentSection })),
  {
    loading: () => (
      <div className="bg-card border-border animate-pulse rounded-xl border p-6">
        <div className="bg-muted mb-4 h-6 w-1/3 rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-20 rounded" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
)
import { useFeed, type SortType } from "@/hooks/use-feed"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

const BettingPage = dynamic(() => import("@/components/betting-page"), {
  loading: () => (
    <div className="bg-card border-border animate-pulse rounded-xl border p-6">
      <div className="bg-muted mb-4 h-6 w-1/3 rounded" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-24 rounded" />
        ))}
      </div>
    </div>
  ),
  ssr: false,
})

type TabType = "feed" | "content"

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const { isSignedIn } = useAuth()
  const searchParams = useSearchParams()
  const isPredictionView = searchParams.get("view") === "prediction"
  const [activeTab, setActiveTab] = useState<TabType>("feed")
  const [sortBy, setSortBy] = useState<SortType>("hot")
  // SWR로 팔로우 커뮤니티 로드 (community-sidebar와 캐시 공유 → 중복 호출 제거)
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

  // 사이드바에서 팔로우 토글 시 SWR 캐시 재검증
  useEffect(() => {
    const handler = () => {
      mutateFollows()
    }
    window.addEventListener("communityFollowChanged", handler)
    return () => window.removeEventListener("communityFollowChanged", handler)
  }, [mutateFollows])

  // 피드 데이터 훅
  const { posts, isLoading, isLoadingMore, loadMore } = useFeed(
    sortBy,
    followedCommunities,
    followsLoaded
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
      className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
      tabIndex={-1}
    >
      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        {/* Left Sidebar */}
        <aside className="col-span-3 hidden lg:block">
          <CommunitySidebar />
        </aside>

        {/* Main Content */}
        <div className="col-span-12 space-y-4 lg:col-span-6">
          {/* 승부 예측 뷰 */}
          {isPredictionView ? (
            <BettingPage />
          ) : (
            <>
              {/* 탭 네비게이션 */}
              <div className="bg-card border-border overflow-hidden rounded-xl border">
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
                    <Newspaper className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    피드
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

                {/* 피드 탭: 정렬 바 */}
                {activeTab === "feed" && (
                  <div className="border-border bg-muted/20 flex items-center justify-center border-t px-4 py-2.5">
                    <div
                      className="flex items-center gap-1.5 sm:gap-2"
                      role="group"
                      aria-label="피드 정렬"
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

              {/* 온보딩 배너: 로그인했지만 팔로우 0개일 때 */}
              {activeTab === "feed" &&
                isSignedIn &&
                followedCommunities.size === 0 &&
                followsLoaded && <OnboardingBanner />}

              {/* 피드 탭 콘텐츠 */}
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

              {/* 콘텐츠 탭 */}
              {activeTab === "content" && <ContentSection />}
            </>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="col-span-3 hidden lg:block">
          <ActivitySidebar showPrize />
        </aside>
      </div>
    </main>
  )
}
