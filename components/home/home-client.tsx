"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { FeedSection } from "@/components/home/feed-section"

const CommunitySidebar = dynamic(
  () =>
    import("@/components/sidebar/community-sidebar").then((m) => ({ default: m.CommunitySidebar })),
  {
    loading: () => <div className="wc-skeleton h-96 rounded-lg" />,
  }
)
const ActivitySidebar = dynamic(
  () =>
    import("@/components/sidebar/activity-sidebar").then((m) => ({ default: m.ActivitySidebar })),
  {
    loading: () => <div className="wc-skeleton h-96 rounded-lg" />,
  }
)
const HotPostToast = dynamic(
  () => import("@/components/home/hot-post-toast").then((m) => ({ default: m.HotPostToast })),
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

  // soft navigation 대응: URL ?tab=content 변경 시 activeTab 동기화
  useEffect(() => {
    const urlTab = searchParams.get("tab")
    if (urlTab === "content" || urlTab === "feed") {
      setActiveTab(urlTab)
    }
  }, [searchParams])
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
    // URL 쿼리 동기화 — 새로고침해도 현재 탭 유지.
    // 기본값(feed)은 쿼리 제거, content는 ?tab=content로.
    const nextUrl = tab === "content" ? "/?tab=content" : "/"
    router.replace(nextUrl, { scroll: false })
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" })
    }
  }

  return (
    <div className="worldcup-scope min-h-[100dvh]">
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
            {/* AnnouncementCarousel은 AppShellClient에서 전역 mount */}
            {/* 월드컵 이벤트 배너 */}
            <Link
              href="/worldcup"
              className="flex items-center gap-3 rounded-xl px-[18px] py-[14px] no-underline transition-opacity hover:opacity-90"
              style={{
                background:
                  "linear-gradient(100deg, var(--wc-burgundy-deep, #771629), var(--wc-burgundy, #961e37))",
                boxShadow: "var(--wc-shadow-2, 0 4px 16px rgba(150,30,55,.22))",
                color: "#fff",
              }}
            >
              <span style={{ fontSize: 20 }} aria-hidden>
                🏆
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[11px] font-extrabold uppercase"
                  style={{ letterSpacing: "0.14em", color: "var(--wc-gold, #FFD96B)" }}
                >
                  World Cup 2026 Event
                </span>
                <span className="mt-0.5 block text-[14.5px] font-bold">
                  월드컵 승부예측 팬덤 대결 — 지금 참가하세요
                </span>
              </span>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg text-[12.5px] font-bold"
                style={{ background: "rgba(255,255,255,.14)", padding: "7px 13px" }}
              >
                사전 등록
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </span>
            </Link>
            {/* 손글씨 태그라인 */}
            <p
              className="leading-snug"
              style={{
                fontFamily: "var(--font-pen, 'Nanum Pen Script', cursive)",
                fontSize: 19,
                color: "var(--wc-mute)",
                marginBottom: -4,
              }}
            >
              그깟 공놀이를 좋아하는 팬들의 놀이터
            </p>
            {/* 필터 스트립 — 한 줄: 탭 pills | separator | sort pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="홈 탭">
                {(
                  [
                    { key: "feed", label: "게시물" },
                    { key: "content", label: "경기 분석글" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={activeTab === key}
                    onClick={() => handleTabClick(key)}
                    className={`inline-flex items-center rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors${activeTab !== key ? "hover:bg-[var(--wc-soft)] hover:text-[var(--wc-ink)]" : ""}`}
                    style={{
                      height: 34,
                      padding: "0 14px",
                      background: activeTab === key ? "var(--wc-burgundy)" : "var(--wc-card)",
                      color: activeTab === key ? "white" : "var(--wc-mute)",
                      border:
                        activeTab === key
                          ? "1px solid var(--wc-burgundy)"
                          : "1px solid var(--wc-line-2)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {activeTab === "feed" && (
                <>
                  <span
                    aria-hidden
                    style={{ width: 1, height: 20, background: "var(--wc-line-2)" }}
                  />
                  <div className="flex items-center gap-1.5" role="group" aria-label="게시물 정렬">
                    {[
                      { key: "random" as const, label: "랜덤" },
                      { key: "hot" as const, label: "온도순" },
                      { key: "new" as const, label: "최신순" },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        aria-pressed={sortBy === key}
                        className={`inline-flex items-center rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors${sortBy !== key ? "hover:bg-[var(--wc-soft)] hover:text-[var(--wc-ink)]" : ""}`}
                        style={{
                          height: 34,
                          padding: "0 14px",
                          background: sortBy === key ? "var(--wc-burgundy)" : "var(--wc-card)",
                          color: sortBy === key ? "white" : "var(--wc-mute)",
                          border:
                            sortBy === key
                              ? "1px solid var(--wc-burgundy)"
                              : "1px solid var(--wc-line-2)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 온보딩 배너 일단 숨김 — 월드컵 이벤트 집중 (복원: OnboardingBanner import + 렌더 복구) */}

            {activeTab === "feed" && (
              <div className="space-y-2.5">
                <FeedSection
                  posts={posts}
                  isLoading={isLoading}
                  isLoadingMore={isLoadingMore}
                  loadMore={loadMore}
                />
              </div>
            )}

            {activeTab === "content" && <ContentSection />}
          </div>

          {/* Right Sidebar */}
          <aside className="col-span-3 hidden lg:block">
            <ActivitySidebar initialRecentComments={initialRecentComments} />
          </aside>
        </div>

        {/* 실시간 인기글 토스트 — feed 탭 + 로그인 시 */}
        {activeTab === "feed" && isSignedIn && (
          <HotPostToast enabled followedSlugs={[...followedCommunities].sort()} />
        )}
      </main>
    </div>
  )
}
