import { NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const { supabase } = auth

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = todayStart.toISOString()

    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekStartISO = weekStart.toISOString()

    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekStartISO = prevWeekStart.toISOString()

    const [
      { count: pendingReports },
      { data: syncState },
      { count: unsettledGames },
      { data: recentCrawlerFails },
      { count: newUsersToday },
      { count: newPostsToday },
      { count: activeUsersToday },
      { data: lastCrawlerRun },
      { count: usersThisWeek },
      { count: usersPrevWeek },
      { data: abnormalTokenBalances },
    ] = await Promise.all([
      // alerts
      supabase
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("betman_sync_state")
        .select("last_checked_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("betman_games")
        .select("*", { count: "exact", head: true })
        .lt("match_time", now.toISOString())
        .is("result", null),
      supabase
        .from("crawler_run_log")
        .select("id")
        .eq("status", "error")
        .gte("started_at", todayISO),
      // daily
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayISO),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayISO),
      supabase
        .from("posts")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", todayISO),
      supabase
        .from("crawler_run_log")
        .select("finished_at")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // weekly
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekStartISO),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevWeekStartISO)
        .lt("created_at", weekStartISO),
      supabase
        .from("user_tokens")
        .select("user_id, token_balance, profiles!inner(nickname)")
        .gt("token_balance", 5000)
        .order("token_balance", { ascending: false })
        .limit(10),
    ])

    // Betman 동기화 지연 체크 (3시간 기준)
    let betmanSyncStale = false
    let betmanLastSync: string | null = null
    if (syncState?.last_checked_at) {
      betmanLastSync = syncState.last_checked_at
      const hoursSince = (Date.now() - new Date(syncState.last_checked_at).getTime()) / (1000 * 60 * 60)
      betmanSyncStale = hoursSince > 3
    } else {
      betmanSyncStale = true
    }

    return NextResponse.json({
      alerts: {
        pendingReports: pendingReports ?? 0,
        betmanSyncStale,
        betmanLastSync,
        unsettledGames: unsettledGames ?? 0,
        cronFailures: recentCrawlerFails?.length ?? 0,
      },
      daily: {
        newUsersToday: newUsersToday ?? 0,
        newPostsToday: newPostsToday ?? 0,
        activeUsersToday: activeUsersToday ?? 0,
        seedBotLastRun: lastCrawlerRun?.finished_at ?? null,
      },
      weekly: {
        usersThisWeek: usersThisWeek ?? 0,
        usersPrevWeek: usersPrevWeek ?? 0,
        abnormalTokenBalances: (abnormalTokenBalances ?? []).map((row: Record<string, unknown>) => {
          const profile = row.profiles as Record<string, unknown> | null
          return {
            user_id: row.user_id,
            nickname: profile?.nickname ?? null,
            token_balance: row.token_balance,
          }
        }),
      },
      fetchedAt: now.toISOString(),
    })
  } catch (error) {
    return apiError("운영 대시보드 데이터 조회 실패", 500, error)
  }
}
