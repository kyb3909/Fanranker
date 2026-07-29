"use client"

import dynamic from "next/dynamic"
import { PageBand } from "@/components/page-band"

const ActivitySidebar = dynamic(
  () =>
    import("@/components/sidebar/activity-sidebar").then((m) => ({ default: m.ActivitySidebar })),
  {
    loading: () => <div className="wc-skeleton h-96 rounded-lg" />,
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
  /** 이벤트 슬롯 — worldcup-2026 status (active=참가 배너, closed=결과 배너, null=슬롯 숨김) */
  worldcupStatus?: string | null
}

export function PredictionClient({ initialRecentComments, worldcupStatus }: PredictionClientProps) {
  return (
    <div className="worldcup-scope min-h-[100dvh]">
      {/* 담벼락·운동장과 같은 풀블리드 다크 밴드 — 본문 그리드 바깥에 둬야 폭이 맞는다 */}
      <PageBand
        kicker="Prediction"
        title="승부예측"
        description="오늘 걸어둔 픽이 밤에 답을 준다. 맞힌 기록은 그대로 남는다."
      />
      <main
        id="main-content"
        className="mx-auto min-h-[80vh] max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* BettingPage가 col-span-9를 점유하며 내부에서 slip rail(4) + content(8) 분할 */}
          <div className="col-span-12 lg:col-span-9">
            {/* 월드컵 이벤트 슬롯 제거 (2026-07-29) — 1차 이벤트 아카이브 비공개
                (/worldcup 전체 redirect). 슬롯 구조는 시즌 이벤트에서 재사용 예정이라
                worldcupStatus prop 은 유지. */}
            <BettingPage railMode />
          </div>

          <aside className="col-span-3 hidden lg:block">
            <ActivitySidebar initialRecentComments={initialRecentComments} />
          </aside>
        </div>
      </main>
    </div>
  )
}
