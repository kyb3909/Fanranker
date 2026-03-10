import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { DashboardKpiCards } from "./_components/dashboard-kpi-cards"
import { DashboardSystemStatus } from "./_components/dashboard-system-status"
import { DashboardNewsCrawler } from "./_components/dashboard-news-crawler"
import { DashboardQuickLinks } from "./_components/dashboard-quick-links"

export const metadata: Metadata = { title: "관리자 대시보드" }
export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const supabase = createServiceRoleClient()

  const [
    { count: totalUsers },
    { count: totalPosts },
    { count: totalPredictions },
    { count: activeGames },
    { count: pendingReports },
    { data: syncState },
    { data: latestTicker },
    { count: tickerCount },
    { data: latestDailyRound },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("posts").select("*", { count: "exact", head: true }),
    supabase.from("betman_predictions").select("*", { count: "exact", head: true }),
    supabase
      .from("betman_games")
      .select("*", { count: "exact", head: true })
      .in("status", ["scheduled", "in_progress"]),
    supabase
      .from("content_reports")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("betman_sync_state")
      .select("last_checked_at, latest_gm_ts, last_sync_action")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_ticker_items")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_ticker_items")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("betman_daily_rounds")
      .select("daily_id, bet_close_at, status")
      .eq("status", "open")
      .order("bet_close_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let betmanStatus: "ok" | "stale" | "error" = "error"
  if (syncState?.last_checked_at) {
    const hoursSince = (Date.now() - new Date(syncState.last_checked_at).getTime()) / 3600000
    betmanStatus = hoursSince < 3 ? "ok" : hoursSince < 6 ? "stale" : "error"
  }

  const dailyRoundNum = latestDailyRound?.daily_id
    ? parseInt(latestDailyRound.daily_id.replace(/\D/g, ""), 10) || null
    : null

  return (
    <main id="main-content" tabIndex={-1} className="space-y-6 p-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground text-sm">시스템 현황 요약</p>
      </div>

      <DashboardKpiCards
        data={{
          totalUsers: totalUsers ?? 0,
          totalPosts: totalPosts ?? 0,
          totalPredictions: totalPredictions ?? 0,
          activeGames: activeGames ?? 0,
          pendingReports: pendingReports ?? 0,
          systemHealthy: betmanStatus !== "error",
        }}
      />

      <DashboardSystemStatus
        data={{
          betmanSync: {
            lastSync: syncState?.last_checked_at ?? null,
            status: betmanStatus,
          },
          crawler: {
            lastRun: latestTicker?.created_at ?? null,
            itemCount: tickerCount ?? 0,
          },
          dailyRound: {
            currentRound: dailyRoundNum,
            resetAt: latestDailyRound?.bet_close_at ?? null,
          },
        }}
      />

      <DashboardNewsCrawler />

      <DashboardQuickLinks />
    </main>
  )
}
