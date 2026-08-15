import { Suspense } from "react"
import type { Metadata } from "next"
import { createAnonClient } from "@/lib/supabase/server"
import { PredictionClient } from "@/components/prediction/prediction-client"
import { getGamesPayloadForSsr } from "@/lib/betman/games-payload"

// 사이드바 데이터(카테고리/최근댓글)는 ISR 5분 캐시. BettingPage 내부 데이터는
// 클라이언트에서 자체 fetch — 경기/배당/내 슬립은 항상 최신 필요.
export const revalidate = 300

export const metadata: Metadata = {
  title: "승부예측",
  description: "오늘의 경기를 예측하고, 맞힌 기록을 랭킹으로 남겨보세요",
  alternates: { canonical: "/prediction" },
  openGraph: {
    title: "승부예측 | gongnori.fan",
    description: "오늘의 경기를 예측하고 팬심을 증명해보세요",
    url: "/prediction",
  },
}

async function fetchSidebarData() {
  const supabase = createAnonClient()

  const [categoriesResult, recentCommentsResult, worldcupStatus, gamesResult] = await Promise.all([
    Promise.resolve(
      supabase
        .from("categories")
        .select("id, slug, name, icon, sort_order, description, parent_slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    )
      .then(({ data }) => data ?? [])
      .catch(() => [] as unknown[]),
    Promise.resolve(
      supabase
        .from("posts")
        .select("id, title, community_slug, comment_count, last_comment_at, created_at")
        .is("deleted_at", null)
        .gt("comment_count", 0)
        .order("last_comment_at", { ascending: false, nullsFirst: false })
        .limit(10)
    )
      .then(({ data }) => data ?? [])
      .catch(() => [] as unknown[]),

    // 이벤트 슬롯 — 향후 이벤트도 events 테이블 status 기반으로 이 자리에서 안내
    Promise.resolve(
      supabase.from("events").select("status").eq("slug", "worldcup-2026").maybeSingle()
    )
      .then(({ data }) => (data as { status?: string } | null)?.status ?? null)
      .catch(() => null),

    // 오늘의 경기 SSR 프리페치 (홈 page.tsx 와 동일 패턴, 2026-07-30 워룸) —
    // "픽 걸러 가기" 직후가 빈 스켈레톤 39개였다. 실패 시 null → 기존 클라 fetch 폴백.
    //
    // ⚠️ 축구 전용 노출 (2026-08-14) — 클라 기본 필터(use-betting-matches)와 키를 맞춰야
    // 폴백이 붙는다. 종목 확장 시 이 인자와 훅 기본값을 함께 되돌릴 것.
    //
    // 자기 도메인 HTTP fetch 였던 것을 공유 함수 직접 호출로 교체 (2026-08-15).
    // 이 경로가 사이트에서 제일 느렸다 — `?sport=축구` 오리진 실측 4.4초.
    // Data Cache 60초 래퍼 필수 — 이 페이지의 revalidate=300 은 동작하지 않는다(홈 주석 참고).
    getGamesPayloadForSsr("축구").catch(() => null),
  ])

  return {
    initialCategories: categoriesResult,
    initialRecentComments: recentCommentsResult,
    worldcupStatus,
    initialGames: gamesResult,
  }
}

export default async function PredictionPage() {
  const data = await fetchSidebarData()

  return (
    <Suspense>
      <PredictionClient
        initialCategories={data.initialCategories}
        initialRecentComments={data.initialRecentComments}
        worldcupStatus={data.worldcupStatus}
        initialGames={data.initialGames}
      />
    </Suspense>
  )
}
