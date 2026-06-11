"use client"

import dynamic from "next/dynamic"

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
}

export function PredictionClient({ initialRecentComments }: PredictionClientProps) {
  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main
        id="main-content"
        className="mx-auto min-h-[80vh] max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <h1 className="sr-only">승부예측 — gongnori.fan</h1>
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* BettingPage가 col-span-9를 점유하며 내부에서 slip rail(4) + content(8) 분할 */}
          <div className="col-span-12 lg:col-span-9">
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
