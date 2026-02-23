import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { DashboardKpiCards } from './_components/dashboard-kpi-cards'
import { DashboardSystemStatus } from './_components/dashboard-system-status'
import { DashboardQuickLinks } from './_components/dashboard-quick-links'

export const metadata: Metadata = { title: "관리자 대시보드" }
export const dynamic = 'force-dynamic'

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
    { data: roundState },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('predictions').select('*', { count: 'exact', head: true }),
    supabase.from('matches').select('*', { count: 'exact', head: true }).eq('is_prediction_open', true),
    supabase.from('content_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('betman_sync_state').select('last_sync_at, status').order('last_sync_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('news_ticker_items').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_round_state').select('current_round, reset_at').maybeSingle(),
  ])

  // Determine betman sync health: stale if >3 hours old
  let betmanStatus: 'ok' | 'stale' | 'error' = 'error'
  if (syncState?.last_sync_at) {
    const hoursSince = (Date.now() - new Date(syncState.last_sync_at).getTime()) / 3600000
    betmanStatus = hoursSince < 3 ? 'ok' : 'stale'
  }

  return (
    <main id="main-content" tabIndex={-1} className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">대시보드</h1>
        <p className="text-sm text-muted-foreground">시스템 현황 요약</p>
      </div>

      <DashboardKpiCards
        data={{
          totalUsers: totalUsers ?? 0,
          totalPosts: totalPosts ?? 0,
          totalPredictions: totalPredictions ?? 0,
          activeGames: activeGames ?? 0,
          pendingReports: pendingReports ?? 0,
          systemHealthy: betmanStatus !== 'error',
        }}
      />

      <DashboardSystemStatus
        data={{
          betmanSync: {
            lastSync: syncState?.last_sync_at ?? null,
            status: betmanStatus,
          },
          crawler: {
            lastRun: latestTicker?.created_at ?? null,
            itemCount: 0,
          },
          dailyRound: {
            currentRound: roundState?.current_round ?? null,
            resetAt: roundState?.reset_at ?? null,
          },
        }}
      />

      <DashboardQuickLinks />
    </main>
  )
}
