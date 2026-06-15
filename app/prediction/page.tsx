import { Suspense } from "react"
import type { Metadata } from "next"
import { createAnonClient } from "@/lib/supabase/server"
import { PredictionClient } from "@/components/prediction/prediction-client"

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

  const [categoriesResult, recentCommentsResult] = await Promise.all([
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
        .select("id, title, community_slug, comment_count, latest_comment_at, created_at")
        .is("deleted_at", null)
        .gt("comment_count", 0)
        .order("latest_comment_at", { ascending: false, nullsFirst: false })
        .limit(10)
    )
      .then(({ data }) => data ?? [])
      .catch(() => [] as unknown[]),
  ])

  return { initialCategories: categoriesResult, initialRecentComments: recentCommentsResult }
}

export default async function PredictionPage() {
  const data = await fetchSidebarData()

  return (
    <Suspense>
      <PredictionClient
        initialCategories={data.initialCategories}
        initialRecentComments={data.initialRecentComments}
      />
    </Suspense>
  )
}
