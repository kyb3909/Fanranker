"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { MinimalPredictionContent } from "@/components/minimal-sport/minimal-prediction-content"
import type { TalkItem } from "@/components/minimal-sport/minimal-talk-list"

const CommunitySidebar = dynamic(
  () =>
    import("@/components/sidebar/community-sidebar").then((m) => ({ default: m.CommunitySidebar })),
  {
    loading: () => <div className="bg-card border-border h-96 animate-pulse rounded-lg border" />,
  }
)
const ActivitySidebar = dynamic(
  () =>
    import("@/components/sidebar/activity-sidebar").then((m) => ({ default: m.ActivitySidebar })),
  {
    loading: () => <div className="bg-card border-border h-96 animate-pulse rounded-lg border" />,
  }
)
const BettingPage = dynamic(() => import("@/components/betting/betting-page"), {
  loading: () => (
    <div className="min-h-[600px]">
      <div className="bg-card border-border rounded-lg border p-4">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-10 w-24 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  ),
})

interface PredictionClientProps {
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
}

export function PredictionClient({
  initialCategories,
  initialRecentComments,
}: PredictionClientProps) {
  // Minimal Sport 디자인용 데이터 어댑터 (HomeClient와 동일 패턴)
  const talkItems = useMemo<TalkItem[]>(() => {
    const list = (initialRecentComments ?? []) as Array<{
      id: string
      title: string
      community_slug: string | null
      comment_count: number | null
    }>
    return list.map((t) => ({
      id: t.id,
      title: t.title,
      community_slug: t.community_slug,
      comment_count: t.comment_count,
    }))
  }, [initialRecentComments])

  const groupedCategories = useMemo(
    () =>
      (initialCategories ?? []) as Array<{
        id: number | string
        slug: string
        name: string
        icon: string | null
        sort_order: number
        parent_slug: string | null
      }>,
    [initialCategories]
  )

  return (
    <>
      {/* 데스크톱: Minimal Sport 디자인 (lg:block 자체 처리) */}
      <MinimalPredictionContent categories={groupedCategories} recentComments={talkItems} />

      {/* 모바일/태블릿: 기존 레이아웃 */}
      <main
        id="main-content"
        className="mx-auto min-h-[80vh] max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:hidden lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <h1 className="sr-only">승부예측 — gongnori.fan</h1>
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <aside className="col-span-3 hidden lg:block">
            <CommunitySidebar initialCategories={initialCategories} />
          </aside>

          <div className="col-span-12 space-y-4 lg:col-span-6">
            <BettingPage />
          </div>

          <aside className="col-span-3 hidden lg:block">
            <ActivitySidebar showPrize initialRecentComments={initialRecentComments} />
          </aside>
        </div>
      </main>
    </>
  )
}
