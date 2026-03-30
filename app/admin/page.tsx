import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { DashboardKpiCards } from "./_components/dashboard-kpi-cards"
import { DashboardSystemStatus } from "./_components/dashboard-system-status"
import { DashboardNewsCrawler } from "./_components/dashboard-news-crawler"
import { DashboardAlerts } from "./_components/dashboard-alerts"
import { DashboardHeader } from "./_components/dashboard-header"

export const metadata: Metadata = { title: "관리자 대시보드" }
export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const supabase = createServiceRoleClient()

  // KST 기준 오늘/어제 시작 시각
  const KST_OFFSET = 9 * 60 * 60 * 1000
  const nowKST = new Date(Date.now() + KST_OFFSET)
  const todayStart = new Date(
    Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate()) - KST_OFFSET
  )
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)

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
    // 트렌드: 오늘
    { count: usersToday },
    { count: postsToday },
    { count: predictionsToday },
    // 트렌드: 어제
    { count: usersYesterday },
    { count: postsYesterday },
    { count: predictionsYesterday },
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
    // 오늘 가입/게시글/예측
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("betman_predictions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    // 어제 가입/게시글/예측
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayStart.toISOString()),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayStart.toISOString()),
    supabase
      .from("betman_predictions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayStart.toISOString()),
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
      <DashboardHeader />

      <DashboardKpiCards
        data={{
          totalUsers: totalUsers ?? 0,
          totalPosts: totalPosts ?? 0,
          totalPredictions: totalPredictions ?? 0,
          activeGames: activeGames ?? 0,
          pendingReports: pendingReports ?? 0,
          systemHealthy: betmanStatus !== "error",
          trends: {
            usersToday: usersToday ?? 0,
            usersYesterday: usersYesterday ?? 0,
            postsToday: postsToday ?? 0,
            postsYesterday: postsYesterday ?? 0,
            predictionsToday: predictionsToday ?? 0,
            predictionsYesterday: predictionsYesterday ?? 0,
          },
        }}
      />

      <DashboardAlerts />

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
    </main>
  )
}
