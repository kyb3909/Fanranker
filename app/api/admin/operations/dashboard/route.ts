import { NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { attachNicknames } from "@/lib/admin/attach-nicknames"
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
      { count: pendingMetaverseReports },
      { count: pendingRefunds },
      { count: pendingStickers },
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
      { count: pendingNewsReview },
      { count: pendingAggReview },
      { count: pendingSagaReview },
    ] = await Promise.all([
      // alerts
      supabase
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("metaverse_user_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("pending_refunds")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("stickers").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase
        .from("betman_sync_state")
        .select("last_checked_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("betman_games")
        .select("*", { count: "exact", head: true })
        // ⚠️ "킥오프 지남 & result null" 그대로면 지금 뛰는 경기까지 미정산으로 센다
        //    (2026-08-30 실측: 122건 전부 진행 중 경기 — 주말 저녁마다 거짓 경보).
        //    경기 ~2h + VPS 동기화 주기 2h + 여유 = 킥오프 5시간 경과부터만.
        .lt("match_time", new Date(now.getTime() - 5 * 3600_000).toISOString())
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
      // profiles 는 FK 가 없어 임베드 불가 → 아래에서 attachNicknames 로 닉네임 병합
      supabase
        .from("user_tokens")
        .select("user_id, token_balance")
        .gt("token_balance", 5000)
        .order("token_balance", { ascending: false })
        .limit(10),
      // 검수 큐 대기 — 사이드바 뱃지 (2026-08-04, "쌓이면 안 된다"가 보이게)
      supabase
        .from("news_reservoir")
        .select("id", { count: "exact", head: true })
        .eq("status", "drafted"),
      supabase
        .from("agg_reservoir")
        .select("id", { count: "exact", head: true })
        .eq("status", "drafted"),
      supabase
        .from("saga_reservoir")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued"),
    ])

    const tokenLeaders = await attachNicknames(supabase, abnormalTokenBalances ?? [])

    // Betman 동기화 지연 체크 (3시간 기준)
    let betmanSyncStale = false
    let betmanLastSync: string | null = null
    if (syncState?.last_checked_at) {
      betmanLastSync = syncState.last_checked_at
      const hoursSince =
        (Date.now() - new Date(syncState.last_checked_at).getTime()) / (1000 * 60 * 60)
      betmanSyncStale = hoursSince > 3
    } else {
      betmanSyncStale = true
    }

    return NextResponse.json({
      alerts: {
        pendingReports: pendingReports ?? 0,
        pendingMetaverseReports: pendingMetaverseReports ?? 0,
        pendingRefunds: pendingRefunds ?? 0,
        pendingStickers: pendingStickers ?? 0,
        betmanSyncStale,
        betmanLastSync,
        unsettledGames: unsettledGames ?? 0,
        cronFailures: recentCrawlerFails?.length ?? 0,
        pendingNewsReview: pendingNewsReview ?? 0,
        pendingAggReview: pendingAggReview ?? 0,
        pendingSagaReview: pendingSagaReview ?? 0,
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
        abnormalTokenBalances: tokenLeaders.map((row) => ({
          user_id: row.user_id,
          nickname: row.profiles.nickname,
          token_balance: row.token_balance,
        })),
      },
      fetchedAt: now.toISOString(),
    })
  } catch (error) {
    return apiError("운영 대시보드 데이터 조회 실패", 500, error)
  }
}
