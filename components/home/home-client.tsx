"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useFeed, type SortType, type PostsResponse } from "@/hooks/use-feed"
import { FeedSection } from "@/components/home/feed-section"
import { isBotUserId } from "@/lib/constants/bot-users"
import { QuickComposer } from "@/components/home/quick-composer"
import { isMatchPageLeague } from "@/lib/match/leagues"
import { FlairFilterBar } from "@/components/home/flair-filter-bar"
import { MatchdayBand } from "@/components/home/matchday-band"
import { PageBand } from "@/components/page-band"
import { CardNewsFeed } from "@/components/cardnews/card-news-feed"
import type { CardNewsItem } from "@/lib/feed/cardnews"
import type { WallFeedRatio } from "@/lib/home/cached-home-data"
import type { GroupedMatch } from "@/types/betting"
import type { LiveMatchRow } from "@/lib/betman/games-payload"
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
// 오늘의 경기 탭 = 실제 베팅 화면 (bettingOnly — 4탭 헤더 없음, 하단 sticky 슬립이
// 탭하면 바텀시트로 펼쳐짐). /worldcup 에서 검증된 모드 재사용.
const BettingPage = dynamic(() => import("@/components/betting/betting-page"), {
  loading: () => <div className="wc-skeleton h-64 rounded-xl" />,
})

/** 담벼락 메인 탭 — 카드뉴스(기본) / 오늘의 경기 / 게시판(기존 정렬 피드) */
export type FeedTab = "cardnews" | "games" | "board"

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
  initialTab?: FeedTab
  /** 월드컵 이벤트 종료 여부 — true 면 배너가 "우승자 확인"으로 전환 */
  worldcupConcluded?: boolean
  initialCardNews?: { cards: CardNewsItem[]; nextCursor: string | null }
  /**
   * 히어로(Top Story) 카드 — 레딧 화력순 (app/page.tsx 에서 확정).
   * initialCardNews.cards 에서는 이미 제외돼 있어 히어로↔떡밥 중복이 없다.
   */
  heroCards?: CardNewsItem[]
  /** SSR 프리페치된 오늘의 경기 — 매치데이 밴드 CLS 제거용 (없으면 클라 SWR 폴백).
   *  liveMatches/finishedMatches 는 밴드의 LIVE·오늘 결과 섹션 초기값 (2026-08-16) */
  initialGames?: {
    groupedGames?: GroupedMatch[]
    liveMatches?: LiveMatchRow[]
    finishedMatches?: LiveMatchRow[]
  } | null
  /** 담벼락 인터리브 비율 (site_settings 다이얼 — cached-home-data.getCachedWallRatio) */
  wallRatio?: WallFeedRatio
  /** 피드 종단 "내일 경기 예고" 문안 (2026-08-21 리포트 Top5-5) — 없으면 일정 도선 폴백 */
  tomorrowMatchTitle?: string | null
  /** 당일 종료 경기의 불판 매핑 (Top5-2 FT 사건 행) — 없으면 매치센터 링크 폴백 */
  ftThreadByGame?: Record<string, string>
}

export function HomeClient({
  initialFeed,
  initialCategories,
  initialRecentComments,
  initialGlobalNotices,
  initialSort = "new",
  initialTab = "cardnews",
  worldcupConcluded = false,
  initialCardNews,
  heroCards,
  initialGames,
  wallRatio,
  tomorrowMatchTitle,
  ftThreadByGame,
}: HomeClientProps) {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sortBy, setSortBy] = useState<SortType>(initialSort)
  const [feedTab, setFeedTab] = useState<FeedTab>(initialTab)

  // 담벼락 인터리브 재료 (2026-08-20) — 사이드바용으로 이미 프리페치된 최근 댓글 글에서
  // **사람 글만** 거른다 (봇 기사는 이미 피드의 주인공이라 인터리브에 낄 이유가 없다).
  // 뉴스:게시글 비율은 site_settings 다이얼 (운영자: "비율을 점진적으로 바꿔나갈 거야")
  // — 사람 글이 늘면 SQL 한 줄로 게시판 쪽으로 기울인다.
  const maxWallCards = wallRatio?.maxWallCards ?? 4
  const humanWallPosts = useMemo(
    () =>
      (
        (initialRecentComments ?? []) as {
          id: string
          title: string
          community_slug: string
          comment_count?: number
          user_id?: string
          image?: string | null
        }[]
      )
        .filter((p) => !isBotUserId(p.user_id))
        .map((p) => ({
          id: p.id,
          title: p.title,
          communitySlug: p.community_slug,
          comments: p.comment_count || 1,
          image: p.image ?? null,
        })),
    [initialRecentComments]
  )
  const wallPosts = useMemo(
    () => humanWallPosts.slice(0, maxWallCards),
    [humanWallPosts, maxWallCards]
  )
  // 피드 종단 실물 (2026-08-21 리포트 Top5-5) — 인터리브에 안 실린 다음 순번 2건.
  // 같은 글이 인터리브와 종단에 두 번 나오는 중복을 막는다. 없으면 빈 배열 → 도선 폴백
  const endWallPosts = useMemo(
    () => humanWallPosts.slice(maxWallCards, maxWallCards + 2),
    [humanWallPosts, maxWallCards]
  )
  // FT 사건 행 (2026-08-21 리포트 Top5-2, 편집 "사건 행" 문법) — 당일 종료 경기가
  // 자기 종료 시각(킥오프+110분)으로 시간순 스트림에 참여한다. 불판 있으면 불판으로,
  // 없으면 매치센터로. 밴드의 "오늘 결과"와 같은 재료·같은 화이트리스트
  const ftRows = useMemo(
    () =>
      (initialGames?.finishedMatches ?? [])
        .filter(
          (m) => isMatchPageLeague(m.leagueCode) && m.homeScore != null && m.awayScore != null
        )
        .map((m) => {
          const threadId = ftThreadByGame?.[m.gameId]
          return {
            key: m.matchKey,
            title: `FT · ${m.homeTeam} ${m.homeScore}–${m.awayScore} ${m.awayTeam}`,
            href: threadId ? `/post/${threadId}?utm_source=ft_row` : `/match/${m.gameId}`,
            action: threadId ? "불판 →" : "매치센터 →",
            postId: threadId ?? null,
            ftAt: new Date(new Date(m.matchTime).getTime() + 110 * 60_000).toISOString(),
          }
        }),
    [initialGames, ftThreadByGame]
  )
  // 밴드 전환 애니메이션 게이트 — 첫 로드에는 안 붙인다(LCP 히어로가 opacity 0 에서
  // 시작하면 LCP 가 늦어진다). 사용자가 탭을 한 번이라도 바꾼 뒤부터, 히어로↔PageBand
  // 리마운트 시 gn-band-in 이 재생돼 530px→밴드 붕괴가 "전환"으로 읽힌다.
  const [bandAnimReady, setBandAnimReady] = useState(false)

  // 탭/정렬을 URL 에 보존 → 새로고침·뒤로가기 시 선택 유지
  // 기본(오늘의 떡밥)=파라미터 없음, 게시판=?tab=board[&sort=], 게임=?tab=games
  useEffect(() => {
    const t = searchParams.get("tab")
    const s = searchParams.get("sort")
    if (t === "games") setFeedTab("games")
    else if (t === "board" || s)
      setFeedTab("board") // 옛 ?sort= 링크는 게시판으로
    else setFeedTab("cardnews")
    if (s === "new" || s === "hot" || s === "random") setSortBy(s)
  }, [searchParams])

  const replaceUrl = (params: URLSearchParams) => {
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : "/", { scroll: false })
  }

  const changeTab = (tab: FeedTab) => {
    setBandAnimReady(true)
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
    if (key === "new")
      params.delete("sort") // 기본값(최신순)은 URL 깔끔하게
    else params.set("sort", key)
    replaceUrl(params)
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
    <div className={`worldcup-scope min-h-[100dvh] ${bandAnimReady ? "gn-band-entering" : ""}`}>
      {/*
        상단 밴드는 탭이 바뀌어도 유지한다 — 정렬 칩을 눌렀다고 밴드가 통째로 사라지면
        같은 페이지로 안 읽힌다(530px → 0). 다만 목록 소비 탭에서 히어로 캐러셀까지
        끌고 가면 스크롤만 늘어나므로, 다른 페이지와 동일한 공용 PageBand 로 낮춘다.
        탭별 라벨: 게시판=담벼락 / 오늘의 경기=경기 안내 — games 탭이 "팔로우한 게시판
        글" 설명을 달고 있던 불일치 수정 (2026-07-30 디자인 감리).
        히어로↔PageBand 스왑은 gn-band-entering 마운트 전환(260ms)으로 붕괴감을 줄인다
        — 첫 로드는 애니메이션 없음(LCP 보호), 탭 전환부터만.
      */}
      {/* 개막 이벤트는 독립 배너 대신 **캐러셀 슬라이드**로 (2026-08-16 운영자 승인).
          종전 배너는 히어로 위에서 min-h 150px 를 추가로 먹어 톱스토리·오늘의 경기를
          접힘 아래로 밀었다. 캐러셀 안에 들어가면 이미 있는 자리를 나눠 쓰므로 세로가
          늘지 않고, 셋이 한 화면에 들어온다. 노출은 회전 첫 장이라 오히려 세다. */}
      {feedTab === "cardnews" ? (
        <MatchdayBand
          cards={heroCards ?? initialCardNews?.cards ?? []}
          initialGames={initialGames}
          eventAsSlide
          initialLive={
            initialGames?.liveMatches
              ? {
                  liveMatches: initialGames.liveMatches,
                  finishedMatches: initialGames.finishedMatches ?? [],
                }
              : null
          }
        />
      ) : feedTab === "games" ? (
        // 같은 DNA 의 축소 매치데이 밴드 — 히어로→"요약"으로 읽히고, 카운트다운이
        // 경기 픽 화면과 문맥이 정확히 맞는다 (감리 실행안 B)
        <MatchdayBand cards={[]} compact initialGames={initialGames} eventAsSlide />
      ) : (
        <PageBand
          as="h2" // sr-only h1(156행)과의 h1 중복 방지 — 문서 아웃라인 고정
          kicker="Wall"
          title="담벼락"
          description={
            isSignedIn
              ? "팔로우한 게시판 글이 여기로 모인다."
              : "지금 올라오는 게시판 글이 여기로 모인다."
          }
        />
      )}
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
            {/* 인라인 글쓰기 프롬프트 — 게시판 탭에서만 (뉴스/베팅 소비 모드와 무관한 CTA) */}
            {/* 한마디 — 글쓰기 버튼(4단 계단) 대신 그 자리에서 바로 쓴다 (2026-08-21 운영자) */}
            {feedTab === "board" && <QuickComposer />}

            {/* 월드컵 이벤트 배너 제거 (2026-07-29) — 1차 이벤트 아카이브 비공개에 따라
                /worldcup 세그먼트 전체가 redirect 되므로 진입 배너도 내린다.
                worldcupConcluded prop 은 시즌 이벤트 배너 재사용 대비로 유지. */}

            {/* 메인 탭 스트립 — 카드뉴스/오늘의 경기 + 게시판 정렬(랜덤/최신순).
                정렬 pill 을 누르면 게시판 탭으로 전환된다. (pill 스타일 유지 — 언더라인 통일 예외)
                온도순은 UI 에서 하차 (2026-08-12 패널): 트래픽 0 에서 온도가 전부 0이라
                "온도순"이 사실상 최신순의 다른 이름이었다 — 라벨이 거짓말을 하고 있었다.
                공식·API(?sort=hot)·문서는 그대로 유지, 트래픽이 쌓여 온도가 실제로 갈리면 복귀. */}
            <div
              className="scrollbar-none mt-4 flex items-center gap-1.5 overflow-x-auto"
              role="group"
              aria-label="담벼락 보기 선택"
            >
              {/* 오늘의 떡밥 = 경기 일정(고정) + 카드뉴스. 베팅 화면은 ?tab=games URL 로만 접근 */}
              {([{ tab: "cardnews", label: "오늘의 떡밥" }] as const).map(({ tab, label }) => {
                const active = feedTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => changeTab(tab)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 items-center rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors${!active ? "hover:bg-[var(--wc-soft)] hover:text-[var(--wc-ink)]" : ""}`}
                    style={{
                      height: 34,
                      padding: "0 14px",
                      background: active ? "var(--wc-burgundy)" : "var(--wc-card)",
                      color: active ? "white" : "var(--wc-mute)",
                      border: active
                        ? "1px solid var(--wc-burgundy)"
                        : "1px solid var(--wc-line-2)",
                    }}
                  >
                    {label}
                  </button>
                )
              })}
              <span
                aria-hidden
                className="mx-0.5 h-4 w-px shrink-0"
                style={{ background: "var(--wc-line-2)" }}
              />
              {[
                { key: "random" as const, label: "랜덤" },
                { key: "new" as const, label: "최신순" },
              ].map(({ key, label }) => {
                const active = feedTab === "board" && sortBy === key
                return (
                  <button
                    key={key}
                    onClick={() => changeSort(key)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 items-center rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors${!active ? "hover:bg-[var(--wc-soft)] hover:text-[var(--wc-ink)]" : ""}`}
                    style={{
                      height: 34,
                      padding: "0 14px",
                      background: active ? "var(--wc-burgundy)" : "var(--wc-card)",
                      color: active ? "white" : "var(--wc-mute)",
                      border: active
                        ? "1px solid var(--wc-burgundy)"
                        : "1px solid var(--wc-line-2)",
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* 온보딩 배너 일단 숨김 — 월드컵 이벤트 집중 (복원: OnboardingBanner import + 렌더 복구) */}

            {feedTab === "cardnews" && (
              <div className="space-y-3">
                {/* 오늘의 경기 일정은 상단 MatchdayBand 가 담당 — 여기서 중복 렌더 X */}
                <CardNewsFeed
                  initialCards={initialCardNews?.cards ?? []}
                  initialCursor={initialCardNews?.nextCursor ?? null}
                  excludeIds={heroCards?.map((h) => h.id)}
                  wallPosts={wallPosts}
                  newsPerWall={wallRatio?.newsPerWall}
                  endWallPosts={endWallPosts}
                  tomorrowTitle={tomorrowMatchTitle}
                  ftRows={ftRows}
                />
              </div>
            )}

            {feedTab === "games" && (
              <BettingPage bettingOnly showFilters initialGames={initialGames} />
            )}

            {feedTab === "board" && (
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
            )}
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
