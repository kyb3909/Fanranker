import type { Metadata } from "next"
import { AnalyticsDashboard } from "../_components/analytics-dashboard"

export const metadata: Metadata = { title: "분석 리포트" }

export default function AdminAnalyticsPage() {
  return <AnalyticsDashboard />
}
