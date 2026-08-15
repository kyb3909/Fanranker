import { Suspense } from "react"
import type { Metadata } from "next"
import { HomePreviewClient } from "@/components/home-preview/home-preview-client"
import { getGamesPayloadForSsr } from "@/lib/betman/games-payload"
import {
  getCachedFeed,
  getCachedCategories,
  getCachedRecentComments,
  getCachedGlobalNotices,
  getCachedCardNews,
  getCachedHeroCards,
} from "@/lib/home/cached-home-data"
import type { CardNewsItem } from "@/lib/feed/cardnews"
import type { SortType } from "@/hooks/use-feed"
import type { GroupedMatch } from "@/types/betting"
import "./preview-tokens.css"

/**
 * 홈 리디자인 **프리뷰** — `/home-preview` (2026-08-15)
 *
 * 프로덕션 홈(`app/page.tsx`)은 **한 줄도 건드리지 않는다.** 데이터는 홈이 쓰는
 * `lib/home/cached-home-data.ts` 의 캐시 함수를 그대로 호출하므로 **같은 글·같은 경기·
 * 같은 카드뉴스**가 나온다 (캐시 키까지 공유 → 추가 DB 왕복 없음).
 *
 * 검색엔진에는 올리지 않는다 — 같은 콘텐츠의 중복 URL 이라 색인되면 안 된다.
 */
export const revalidate = 300

export const metadata: Metadata = {
  title: "홈 디자인 프리뷰",
  robots: { index: false, follow: false },
}

async function fetchPreviewData(sort: SortType) {
  const [
    feedResult,
    categoriesResult,
    recentCommentsResult,
    globalNoticesResult,
    cardNewsResult,
    heroResult,
    gamesResult,
  ] = await Promise.all([
    getCachedFeed(sort),
    getCachedCategories(),
    getCachedRecentComments(),
    getCachedGlobalNotices(),
    getCachedCardNews(),
    getCachedHeroCards(),
    getGamesPayloadForSsr()
      .then((p) => ({ groupedGames: p.groupedGames as unknown as GroupedMatch[] }))
      .catch(() => null),
  ])

  // 히어로 확정 규칙은 프로덕션 홈과 동일하게 맞춘다 — 운영자 핀 우선, 핀이 0개일 때만
  // 최신 이미지 카드로 채운다. 히어로에 오른 글은 아래 떡밥 피드에서 제외(중복 제거).
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
    initialCardNews: {
      cards: cardNewsResult.cards.filter((c) => !heroIds.includes(c.id)),
      nextCursor: cardNewsResult.nextCursor,
    },
    heroCards,
    initialGames: gamesResult,
  }
}

export default async function HomePreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const initialSort: SortType =
    params.sort === "hot" ? "hot" : params.sort === "random" ? "random" : "new"
  const data = await fetchPreviewData(initialSort)

  return (
    <Suspense>
      <HomePreviewClient
        initialFeed={data.initialFeed}
        initialCategories={data.initialCategories}
        initialRecentComments={data.initialRecentComments}
        initialGlobalNotices={data.initialGlobalNotices}
        initialSort={initialSort}
        initialTab={
          params.tab === "games"
            ? "games"
            : params.tab === "board" || params.sort
              ? "board"
              : "cardnews"
        }
        initialCardNews={data.initialCardNews}
        heroCards={data.heroCards}
        initialGames={data.initialGames}
      />
    </Suspense>
  )
}
