"use client"

import dynamic from "next/dynamic"
import { PageBand } from "@/components/page-band"
import { GUNNERS_SEASON, isEventLive } from "@/lib/event/gunners-season"

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
  /** SSR 프리페치된 경기 데이터 — 첫 HTML 부터 경기 카드 렌더 (빈 스켈레톤 39개 제거) */
  initialGames?: unknown | null
}

export function PredictionClient({
  initialRecentComments,
  worldcupStatus,
  initialGames,
}: PredictionClientProps) {
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
                worldcupStatus prop 은 유지.

                2026-08-14: 이벤트 기간에는 승부예측 메뉴 자체가 **이벤트 전용**이다
                (운영자 지시). eventSlug 를 넘기면 슬립에 event_id 가 찍혀 이번 이벤트
                데이터만 따로 쌓이고, 미신청자 제출은 API 가 403(needs_registration)으로
                막는다 — "참가 신청 이후에 참여 가능" 규칙의 실제 집행 지점. */}
            <BettingPage
              railMode
              initialGames={initialGames}
              eventSlug={isEventLive() ? GUNNERS_SEASON.dbSlug : undefined}
            />
          </div>

          <aside className="col-span-3 hidden lg:block">
            <ActivitySidebar initialRecentComments={initialRecentComments} />
          </aside>
        </div>
      </main>
    </div>
  )
}
