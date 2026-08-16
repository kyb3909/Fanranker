import { Suspense } from "react"
import { redirect } from "next/navigation"
import { HomeClient } from "@/components/home/home-client"
import { type CardNewsItem } from "@/lib/feed/cardnews"
import { getGamesPayloadForSsr } from "@/lib/betman/games-payload"
import {
  getCachedFeed,
  getCachedCategories,
  getCachedRecentComments,
  getCachedGlobalNotices,
  getCachedWorldcupStatus,
  getCachedCardNews,
  getCachedHeroCards,
} from "@/lib/home/cached-home-data"
import type { PostsResponse, SortType } from "@/hooks/use-feed"
import type { GroupedMatch } from "@/types/betting"

// 홈페이지 ISR: 5분 캐시 + stale-while-revalidate.
// 새 글 작성 시 /api/posts POST가 revalidatePath("/")로 즉시 갱신.
export const revalidate = 300

/**
 * 홈 페이지 (Server Component)
 *
 * 서버에서 피드 + 사이드바 + 배너 데이터를 병렬로 프리페치하여
 * 클라이언트 API 워터폴을 제거. TTFB에 모든 데이터가 포함됨.
 */
async function fetchAllHomeData(sort: SortType) {
  // 모든 데이터를 병렬로 — 각각 Data Cache 로 감싼 래퍼를 쓴다 (lib/home/cached-home-data.ts).
  //
  // ⚠️ 이 페이지의 `revalidate = 300` 은 **동작하지 않는다** (ClerkProvider dynamic → 매 요청
  //    통째로 재렌더, x-vercel-cache 100% MISS). 캐시는 전적으로 아래 래퍼들이 담당한다.
  //    소스를 추가할 땐 반드시 같이 감쌀 것 — 무캐시 하나가 병렬 묶음 전체를 인질로 잡는다
  //    (2026-08-15 실측: 무캐시 왕복 1회가 iad1→아시아 300ms~2초).
  const [
    feedResult,
    categoriesResult,
    recentCommentsResult,
    globalNoticesResult,
    worldcupStatus,
    cardNewsResult,
    heroResult,
    gamesResult,
  ] = await Promise.all([
    // 1) 메인 피드 — 정렬 반영(최신순=created_at, 그 외=temperature)으로 깜빡임 제거
    getCachedFeed(sort),

    // 2) 카테고리 (CommunitySidebar용) — /prediction 과 캐시 키를 공유한다
    getCachedCategories(),

    // 3) 최근 댓글 달린 글 (ActivitySidebar용) — /prediction 과 캐시 키를 공유한다
    getCachedRecentComments(),

    // 4) 전체 공지 (담벼락 최상단 고정) — 관리자가 is_global_notice=true 로 고정한 글
    getCachedGlobalNotices(),

    // 5) 월드컵 이벤트 상태 (배너 전환용 — closed 면 "우승자 확인")
    getCachedWorldcupStatus(),

    // 6) 카드뉴스 피드 (담벼락 기본 탭) — 실패해도 홈은 뜬다
    getCachedCardNews(),

    // 7) 히어로(Top Story) — 운영자 수동 큐레이션(hero_pinned_at, 2026-08-03).
    //    핀이 하나도 없으면 빈 배열 → 아래 최신 이미지 카드 폴백 (빈 히어로 방지)
    getCachedHeroCards(),

    // 8) 오늘의 경기 (매치데이 밴드) — SSR 로 실어 하이드레이션 후 밴드가 자라며
    //    본문을 밀어내는 CLS(모바일 0.17)를 제거. 빌드/장애 시 null → 밴드가 기존처럼
    //    클라 SWR 로 폴백.
    //
    //    ⚠️ 예전에는 여기서 `fetch("https://gongnori.fan/api/sports/games")` 로 **자기
    //    자신을 HTTP 로** 불렀다. 서버 함수(iad1)가 인터넷으로 나갔다 자기 도메인으로 되돌아
    //    오는 구조라 왕복이 통째로 낭비였고, 홈 렌더의 long pole 이었다 (2026-08-15 실측:
    //    홈 완료까지 2.7~3.5초). 같은 로직을 라우트와 공유하는 함수로 직접 호출한다.
    //    비로그인 형태(userId 없음)로 부르므로 개인 예측 조회 왕복도 발생하지 않는다.
    //    ⚠️ 반드시 Data Cache 로 감싼 `getGamesPayloadForSsr` 를 쓸 것 — 이 페이지의
    //    `revalidate = 300` 은 실제로는 동작하지 않아(ClerkProvider dynamic) 매 요청마다
    //    렌더된다. 캐시 없이 직접 부르면 왕복만 줄고 DB 조회는 늘어난다.
    getGamesPayloadForSsr()
      .then((p) => ({
        groupedGames: p.groupedGames as unknown as GroupedMatch[],
        // 진행 중/당일 종료 — 매치데이 밴드 LIVE·오늘 결과 섹션 (2026-08-16)
        liveMatches: p.liveMatches,
        finishedMatches: p.finishedMatches,
      }))
      .catch(() => null),
  ])

  // 히어로 확정: 운영자 핀 우선. **핀이 하나라도 있으면 그것만** 올린다(채워넣기 없음 —
  // "메인은 내가 선택한 것만", 2026-08-03). 핀이 0개일 때만 최신 이미지 카드로 3장을
  // 채운다 — 핀 지정 전 홈 히어로가 통째로 비는 것 방지.
  // 히어로에 오른 글은 아래 떡밥 피드에서 제외한다 — 같은 화면에 두 번 나오는 중복 제거.
  const heroCards: CardNewsItem[] = [...heroResult]
  if (heroCards.length === 0) {
    for (const c of cardNewsResult.cards) {
      if (heroCards.length >= 3) break
      if (c.image) heroCards.push(c)
    }
  }
  const heroIds = heroCards.map((h) => h.id)

  return {
    initialFeed: feedResult,
    initialCategories: categoriesResult,
    initialRecentComments: recentCommentsResult,
    initialGlobalNotices: globalNoticesResult as {
      id: string
      title: string
      content?: unknown
    }[],
    worldcupConcluded: worldcupStatus === "closed",
    initialCardNews: {
      cards: cardNewsResult.cards.filter((c) => !heroIds.includes(c.id)),
      nextCursor: cardNewsResult.nextCursor,
    },
    heroCards,
    heroIds,
    initialGames: gamesResult,
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams

  // 옛 ?view=prediction 링크는 /prediction 1급 라우트로 영구 이동.
  if (params.view === "prediction") {
    redirect(params.tab ? `/prediction?tab=${params.tab}` : "/prediction")
  }

  // 기본 정렬 = 최신순(new). ?sort=hot|random 으로만 다른 정렬 진입.
  const initialSort: SortType =
    params.sort === "hot" ? "hot" : params.sort === "random" ? "random" : "new"
  const homeData = await fetchAllHomeData(initialSort)

  return (
    <Suspense>
      <HomeClient
        initialFeed={homeData.initialFeed}
        initialCategories={homeData.initialCategories}
        initialRecentComments={homeData.initialRecentComments}
        initialGlobalNotices={homeData.initialGlobalNotices}
        initialSort={initialSort}
        initialTab={
          params.tab === "games"
            ? "games"
            : params.tab === "board" || params.sort
              ? "board" // 옛 ?sort= 링크는 게시판 탭으로
              : "cardnews" // 기본 = 오늘의 떡밥
        }
        worldcupConcluded={homeData.worldcupConcluded}
        initialCardNews={homeData.initialCardNews}
        heroCards={homeData.heroCards}
        initialGames={homeData.initialGames}
      />
    </Suspense>
  )
}
