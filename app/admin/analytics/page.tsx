import type { Metadata } from "next"
import { AnalyticsDashboard } from "../_components/analytics-dashboard"
import { InsightCard } from "../_components/insight-card"
import { FunnelCard } from "../_components/funnel-card"

export const metadata: Metadata = { title: "분석 리포트" }

/**
 * 분석 리포트 — 급한 업무가 아니라 **주 단위 판단**을 하는 자리.
 *
 * 인사이트·퍼널 카드는 `/admin2` 작업대에 있던 것을 2026-09-08 통합 때 여기로 옮겼다.
 * 관제 센터 첫 화면에서는 긴급 업무를 밀어내면 안 되고(장식적 통계 금지), 그렇다고
 * 없애서도 안 되는 자료라 분석 시간용 화면에 둔다.
 */
export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-4">
      <AnalyticsDashboard />
      <div className="space-y-4 px-6 pb-6">
        <InsightCard />
        <FunnelCard />
      </div>
    </div>
  )
}
