"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowRight, Pencil } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { FeedSection } from "@/components/home/feed-section"
import { FlairFilterBar } from "@/components/home/flair-filter-bar"
import { GlobalNoticeBanner, type GlobalNotice } from "@/components/home/global-notice-banner"
// 사이드바는 SSR 프리페치 데이터로 즉시 렌더되므로 직접 import.
// dynamic() 로 감싸면 하이드레이션 시 loading 스켈레톤(h-96)이 잠깐 떴다가 실제 사이드바로
// 되돌아오며 광고 박스가 ~365px 밀리는 CLS 발생 → 직접 import 로 그 시프트 제거.
import { CommunitySidebar } from "@/components/sidebar/community-sidebar"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"

const HotPostToast = dynamic(
  () => import("@/components/home/hot-post-toast").then((m) => ({ default: m.HotPostToast })),
  { ssr: false }
)

// 비로그인은 유니버설(전체 hot) — SSR 과 동일 키로 CLS/ISR 캐시 유지(클라 재요청 X).
// 로그인은 개인화(팔로우 게시판 + 말머리 필터): 로그인 유저만 /api/posts 를 재요청하므로
// 비로그인 홍보 트래픽의 CLS/ISR 은 그대로다. EMPTY_FOLLOWS 는 비로그인 fallback 용.
const EMPTY_FOLLOWS = new Set<string>()

interface HomeClientProps {
  initialFeed: PostsResponse
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
  initialGlobalNotices?: GlobalNotice[]
  initialSort?: SortType
  /** 월드컵 이벤트 종료 여부 — true 면 배너가 "우승자 확인"으로 전환 */
  worldcupConcluded?: boolean
}

export function HomeClient({
  initialFeed,
  initialCategories,
  initialRecentComments,
  initialGlobalNotices,
  initialSort = "new",
  worldcupConcluded = false,
}: HomeClientProps) {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sortBy, setSortBy] = useState<SortType>(initialSort)

  // 정렬을 URL ?sort= 에 보존 → 새로고침·뒤로가기 시 선택한 정렬 유지
  useEffect(() => {
    const s = searchParams.get("sort")
    if (s === "new" || s === "hot" || s === "random") setSortBy(s)
  }, [searchParams])

  const changeSort = (key: SortType) => {
    setSortBy(key)
    const params = new URLSearchParams(searchParams.toString())
    if (key === "new")
      params.delete("sort") // 기본값(최신순)은 URL 깔끔하게
    else params.set("sort", key)
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : "/", { scroll: false })
  }

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
  useEffect(() => {
    const handler = () => {
      mutateFollows()
    }
    window.addEventListener("communityFollowChanged", handler)
    return () => window.removeEventListener("communityFollowChanged", handler)
  }, [mutateFollows])

  // 피드 데이터 훅 — 비로그인은 유니버설(SSR fallback, 재요청 X), 로그인은 개인화
  // (팔로우 게시판 + 말머리 필터). followsLoaded 로 팔로우 로드 전 빈 피드 깜빡임 방지.
  const followsLoaded = !isSignedIn || !!followsData
  const { posts, isLoading, isLoadingMore, loadMore } = useFeed(
    sortBy,
    isSignedIn ? followedCommunities : EMPTY_FOLLOWS,
    followsLoaded,
    initialFeed
  )

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main
        id="main-content"
        className="mx-auto min-h-[80vh] max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <h1 className="sr-only">gongnori.fan — 공놀이에 진심인 팬들의 놀이터</h1>
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar */}
          <aside className="col-span-3 hidden lg:block">
            <CommunitySidebar initialCategories={initialCategories} />
          </aside>

          {/* Main Content */}
          <div className="col-span-12 space-y-4 lg:col-span-6">
            {/* 전체 공지 — 담벼락 최상단 고정 (관리자가 is_global_notice 로 설정) */}
            <GlobalNoticeBanner notices={initialGlobalNotices ?? []} />
            {/* AnnouncementCarousel은 AppShellClient에서 전역 mount */}
            {/* 인라인 글쓰기 프롬프트 — 작성 유도(상단) */}
            <Link
              href="/write"
              className="flex items-center gap-3 rounded-xl px-4 py-3 no-underline transition-opacity hover:opacity-90"
              style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
                aria-hidden
              >
                <Pencil className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[14px]" style={{ color: "var(--wc-mute)" }}>
                오늘 무슨 공놀이 이야기? 한 줄 남겨보세요…
              </span>
              <span
                className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-bold"
                style={{ background: "var(--wc-burgundy)", color: "#fff" }}
              >
                글쓰기
              </span>
            </Link>

            {/* 월드컵 이벤트 배너 (글쓰기와 카드 사이) — 종료 시 "우승자 확인"으로 전환 */}
            <Link
              href={worldcupConcluded ? "/worldcup/result" : "/worldcup"}
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
                  {worldcupConcluded
                    ? "대회가 마무리되었습니다 — 우승자를 확인하세요"
                    : "월드컵 승부예측 구너들의 대결 — 지금 참가하세요"}
                </span>
              </span>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg text-[12.5px] font-bold"
                style={{ background: "rgba(255,255,255,.14)", padding: "7px 13px" }}
              >
                {worldcupConcluded ? "우승자 확인" : "참가 신청"}
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </span>
            </Link>

            {/* 정렬 스트립 — 랜덤/온도순/최신순. (담벼락은 pill 스타일 유지 — 언더라인 통일 예외) */}
            <div className="mt-4 flex items-center gap-1.5" role="group" aria-label="게시물 정렬">
              {[
                { key: "random" as const, label: "랜덤" },
                { key: "hot" as const, label: "온도순" },
                { key: "new" as const, label: "최신순" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => changeSort(key)}
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

            {/* 온보딩 배너 일단 숨김 — 월드컵 이벤트 집중 (복원: OnboardingBanner import + 렌더 복구) */}

            <div className="space-y-2.5">
              {/* 말머리 필터 — 로그인 사용자만. 팔로우 게시판 말머리 즐겨찾기/뮤트로 담벼락 개인화 */}
              {isSignedIn && <FlairFilterBar followedSlugs={[...followedCommunities]} />}
              <FeedSection
                posts={posts}
                isLoading={isLoading}
                isLoadingMore={isLoadingMore}
                loadMore={loadMore}
              />
            </div>
          </div>

          {/* Right Sidebar */}
          <aside className="col-span-3 hidden lg:block">
            <ActivitySidebar initialRecentComments={initialRecentComments} />
          </aside>
        </div>

        {/* 실시간 인기글 토스트 — 로그인 시 */}
        {isSignedIn && <HotPostToast enabled followedSlugs={[...followedCommunities].sort()} />}
      </main>
    </div>
  )
}
