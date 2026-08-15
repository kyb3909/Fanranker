"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { FeedSection } from "@/components/home/feed-section"
import { FlairFilterBar } from "@/components/home/flair-filter-bar"
import { MatchdayBand } from "@/components/home/matchday-band"
import { CardNewsFeed } from "@/components/cardnews/card-news-feed"
import { GlobalNoticeBanner, type GlobalNotice } from "@/components/home/global-notice-banner"
import { CommunitySidebar } from "@/components/sidebar/community-sidebar"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { CommunityBridge } from "@/components/home-preview/community-bridge"
import { PinnedEventCard } from "@/components/home-preview/pinned-event-card"
import type { FeedTab } from "@/components/home/home-client"
import type { CardNewsItem } from "@/lib/feed/cardnews"
import type { GroupedMatch } from "@/types/betting"

const BettingPage = dynamic(() => import("@/components/betting/betting-page"), {
  loading: () => <div className="wc-skeleton h-64 rounded-xl" />,
})

/**
 * 홈 리디자인 **프리뷰** (2026-08-15). 프로덕션 홈(`/`)은 건드리지 않는다.
 *
 * HomeClient 와 데이터·훅·자식 컴포넌트를 그대로 공유하고 **배치만** 바꾼다.
 * 상태 로직을 복제한 이유: HomeClient 를 고치면 프로덕션이 같이 흔들린다. 프리뷰가
 * 승인되면 그때 이 배치를 HomeClient 로 옮긴다 (§16).
 *
 * ## 무엇을 바꿨나 — 진단은 "색이 아니라 구조"
 * 1. **폭 통일**: 히어로 내부와 본문이 같은 1080 컨테이너를 쓴다. 기존은 히어로 1280 /
 *    본문 sm 600→lg 1280 이라 좌우 정렬선이 두 번 어긋났다.
 * 2. **Bridge**: 히어로에 24px 걸친 내비 띠. 경계에 두 존을 동시에 밟는 요소를 놓아
 *    "끊김"을 "전환"으로 바꾼다. 실제 탭 상태를 쥔다(장식 아님).
 * 3. **2단 그리드**: 12컬럼 3-6-3(가운데만 좁고 양옆이 비는 구조) → 피드 720 + 레일 320.
 *    좌우 사이드바 둘을 오른쪽 레일 하나로 합쳤다.
 * 4. **지면 색**: 순백 대신 웜 오프화이트(#f5f3f1) — 다크에서 내려올 때 명도 점프 완화.
 * 5. **행 기반 피드**: 게시물마다 둥근 카드 대신 구분선. 제목 타이포가 주인공이 된다.
 */
const EMPTY_FOLLOWS = new Set<string>()

interface HomePreviewClientProps {
  initialFeed: PostsResponse
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
  initialGlobalNotices?: GlobalNotice[]
  initialSort?: SortType
  initialTab?: FeedTab
  initialCardNews?: { cards: CardNewsItem[]; nextCursor: string | null }
  heroCards?: CardNewsItem[]
  initialGames?: { groupedGames?: GroupedMatch[] } | null
}

export function HomePreviewClient({
  initialFeed,
  initialCategories,
  initialRecentComments,
  initialGlobalNotices,
  initialSort = "new",
  initialTab = "cardnews",
  initialCardNews,
  heroCards,
  initialGames,
}: HomePreviewClientProps) {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sortBy, setSortBy] = useState<SortType>(initialSort)
  const [feedTab, setFeedTab] = useState<FeedTab>(initialTab)

  useEffect(() => {
    const t = searchParams.get("tab")
    const s = searchParams.get("sort")
    if (t === "games") setFeedTab("games")
    else if (t === "board" || s) setFeedTab("board")
    else setFeedTab("cardnews")
    if (s === "new" || s === "hot" || s === "random") setSortBy(s)
  }, [searchParams])

  // 프리뷰 라우트에 머문다 — 프로덕션 홈으로 튕기지 않게 base 를 고정
  const replaceUrl = (params: URLSearchParams) => {
    const qs = params.toString()
    router.replace(qs ? `/home-preview?${qs}` : "/home-preview", { scroll: false })
  }

  const changeTab = (tab: FeedTab) => {
    setFeedTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("sort")
    if (tab === "cardnews") params.delete("tab")
    else params.set("tab", tab)
    replaceUrl(params)
  }

  const changeSort = (key: SortType) => {
    setFeedTab("board")
    setSortBy(key)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", "board")
    if (key === "new") params.delete("sort")
    else params.set("sort", key)
    replaceUrl(params)
  }

  const { data: followsData, mutate: mutateFollows } = useSWR(
    isSignedIn ? "/api/community/follows" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )
  const followedCommunities = useMemo(() => {
    if (!isSignedIn || !followsData) return new Set<string>()
    return new Set<string>(
      (followsData.communities || []).map((c: { community_slug: string }) => c.community_slug)
    )
  }, [isSignedIn, followsData])
  useEffect(() => {
    const handler = () => mutateFollows()
    window.addEventListener("communityFollowChanged", handler)
    return () => window.removeEventListener("communityFollowChanged", handler)
  }, [mutateFollows])

  const followsLoaded = !isSignedIn || !!followsData
  const { posts, isLoading, isLoadingMore, loadMore } = useFeed(
    sortBy,
    isSignedIn ? followedCommunities : EMPTY_FOLLOWS,
    followsLoaded,
    initialFeed
  )

  return (
    <div className="worldcup-scope gnp-scope min-h-[100dvh]">
      {/* 다크 히어로 — 컴포넌트는 프로덕션과 동일. 내부 폭만 스코프 CSS 가 1080 으로 맞춘다 */}
      {feedTab === "games" ? (
        <MatchdayBand cards={[]} compact initialGames={initialGames} hideEventBanner />
      ) : (
        <MatchdayBand
          cards={heroCards ?? initialCardNews?.cards ?? []}
          initialGames={initialGames}
          hideEventBanner
        />
      )}

      <main
        id="main-content"
        className="mx-auto w-full px-4 pb-16 sm:px-6"
        style={{ maxWidth: "var(--gnp-max)" }}
        tabIndex={-1}
      >
        <h1 className="sr-only">gongnori.fan — 공놀이에 진심인 팬들의 놀이터 (디자인 프리뷰)</h1>

        {/* 이음매 — 히어로에 24px 걸친다 */}
        <CommunityBridge feedTab={feedTab} sortBy={sortBy} onTab={changeTab} onSort={changeSort} />

        <div
          className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_var(--gnp-rail)]"
          style={{ columnGap: "var(--gnp-gap)" }}
        >
          {/* ── 피드 ── */}
          <div className="min-w-0">
            <GlobalNoticeBanner notices={initialGlobalNotices ?? []} />

            {feedTab === "cardnews" && (
              <section className="mt-4 space-y-3">
                <SectionLabel eyebrow="Today" title="오늘의 떡밥" />
                {/* 히어로에서 내려온 개막 이벤트 — 떡밥 회전과 무관하게 첫 칸 고정 */}
                <PinnedEventCard />
                <CardNewsFeed
                  initialCards={initialCardNews?.cards ?? []}
                  initialCursor={initialCardNews?.nextCursor ?? null}
                  excludeIds={heroCards?.map((h) => h.id)}
                />
              </section>
            )}

            {feedTab === "games" && (
              <section className="mt-4">
                <SectionLabel eyebrow="Matchday" title="오늘의 경기" />
                <div className="mt-3">
                  <BettingPage bettingOnly showFilters initialGames={initialGames} />
                </div>
              </section>
            )}

            {feedTab === "board" && (
              <section className="mt-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <SectionLabel eyebrow="Wall" title="담벼락" />
                  {/* 정렬 — 알약 대신 텍스트 토글 (박스 남발 회피) */}
                  <div className="flex items-center gap-3 pb-1">
                    {(
                      [
                        { key: "new" as const, label: "최신순" },
                        { key: "random" as const, label: "랜덤" },
                      ] satisfies { key: SortType; label: string }[]
                    ).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => changeSort(key)}
                        aria-pressed={sortBy === key}
                        className="text-[13px] font-bold transition-colors"
                        style={{
                          color: sortBy === key ? "var(--gnp-accent)" : "var(--wc-mute)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {isSignedIn && (
                  <div className="mt-3">
                    <FlairFilterBar followedSlugs={[...followedCommunities]} />
                  </div>
                )}

                {/* 행 기반 — 바깥 테두리 하나로 묶고 안쪽은 구분선으로 나눈다 */}
                <div
                  className="mt-3 overflow-hidden rounded-xl"
                  style={{ border: "1px solid var(--gnp-line)", background: "var(--gnp-surface)" }}
                >
                  <FeedSection
                    posts={posts}
                    isLoading={isLoading}
                    isLoadingMore={isLoadingMore}
                    loadMore={loadMore}
                    variant="row"
                  />
                </div>
              </section>
            )}
          </div>

          {/* ── 우측 레일 — 기존 좌/우 사이드바를 하나로 흡수 ── */}
          <aside className="min-w-0 lg:sticky lg:top-[84px]">
            <div className="space-y-5">
              <CommunitySidebar initialCategories={initialCategories} />
              <ActivitySidebar initialRecentComments={initialRecentComments} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

/** 섹션 라벨 — 히어로의 압축 스포츠 타이포를 커뮤니티로 이어 붙이는 지점 */
function SectionLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="gnp-eyebrow">{eyebrow}</span>
      <h2
        className="text-[20px] leading-none font-extrabold"
        style={{ color: "var(--wc-ink)", fontFamily: "var(--font-display-ko), var(--font-title)" }}
      >
        {title}
      </h2>
    </div>
  )
}
