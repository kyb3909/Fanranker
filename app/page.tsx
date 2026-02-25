"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { Header } from "@/components/header"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { Dices, Flame, Clock, Newspaper, Trophy } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { OnboardingBanner } from "@/components/onboarding-banner"
import { FeedSection } from "@/components/home/feed-section"
import { ContentSection } from "@/components/home/content-section"
import { useFeed, type SortType } from "@/hooks/use-feed"

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
  const [followedCommunities, setFollowedCommunities] = useState<Set<string>>(new Set())
  const [followsLoaded, setFollowsLoaded] = useState(false)

  // 로그인 유저의 팔로우 커뮤니티 로드
  useEffect(() => {
    if (!isSignedIn) {
      setFollowsLoaded(true)
      return
    }
    fetch("/api/community/follows")
      .then((res) => (res.ok ? res.json() : { communities: [] }))
      .then((data) => {
        const slugs = new Set<string>(
          (data.communities || []).map((c: { community_slug: string }) => c.community_slug)
        )
        setFollowedCommunities(slugs)
      })
      .catch(() => setFollowedCommunities(new Set()))
      .finally(() => setFollowsLoaded(true))
  }, [isSignedIn])

  // 사이드바에서 팔로우 토글 시 즉시 반영
  useEffect(() => {
    const handler = (e: Event) => {
      const { allSlugs } = (e as CustomEvent).detail
      setFollowedCommunities(new Set<string>(allSlugs))
    }
    window.addEventListener("communityFollowChanged", handler)
    return () => window.removeEventListener("communityFollowChanged", handler)
  }, [])

  // 피드 데이터 훅
  const { posts, isLoading, isLoadingMore, loadMore } = useFeed(
    sortBy,
    followedCommunities,
    followsLoaded
  )

  return (
    <div className="bg-background min-h-screen">
      <Header />

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
                  <div className="border-border flex border-b" role="tablist" aria-label="홈 탭">
                    <button
                      role="tab"
                      aria-selected={activeTab === "feed"}
                      onClick={() => setActiveTab("feed")}
                      className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-[14px] font-semibold transition-all ${
                        activeTab === "feed"
                          ? "text-foreground border-primary border-b-2"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Newspaper className="h-4 w-4 shrink-0" aria-hidden="true" />
                      피드
                    </button>
                    <button
                      role="tab"
                      aria-selected={activeTab === "content"}
                      onClick={() => setActiveTab("content")}
                      className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-[14px] font-semibold transition-all ${
                        activeTab === "content"
                          ? "text-foreground border-primary border-b-2"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
                      승부 예측
                    </button>
                  </div>

                  {/* 피드 탭: 정렬 바 */}
                  {activeTab === "feed" && (
                    <div className="bg-muted/30 flex items-center justify-center px-4 py-3">
                      <div
                        className="flex items-center gap-2 sm:gap-3"
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
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-all sm:gap-2 sm:px-4 sm:text-[15px] ${
                              sortBy === key
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
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
                  <div className="space-y-3">
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
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}
