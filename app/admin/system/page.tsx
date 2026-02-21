import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { SystemHealthCards } from './system-health-cards'
import { CrawlerHistory } from './crawler-history'

export const metadata: Metadata = { title: "시스템 상태" }
export const dynamic = 'force-dynamic'

export default async function AdminSystemPage() {
  const supabase = createServiceRoleClient()

  const [
    { data: syncState },
    { data: crawlerRuns },
    { count: crawlerTotal },
    { data: dailyRound },
    { count: tickerCount },
  ] = await Promise.all([
    supabase
      .from('betman_sync_state')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('crawler_run_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50),
    supabase
      .from('crawler_run_log')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('betman_daily_rounds')
      .select('*')
      .order('daily_id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('news_ticker_items')
      .select('*', { count: 'exact', head: true }),
  ])

  const lastCrawlerRun = crawlerRuns?.[0] ?? null

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">시스템 상태</h1>
        <p className="text-sm text-muted-foreground">서비스 동기화 및 크롤러 상태를 모니터링합니다.</p>
      </div>

      <SystemHealthCards
        data={{
          betmanSync: {
            lastCheckedAt: syncState?.last_checked_at ?? null,
            lastAction: syncState?.last_sync_action ?? null,
            gamesCount: syncState?.last_sync_games_count ?? null,
            lastError: syncState?.last_error ?? null,
            updatedAt: syncState?.updated_at ?? null,
          },
          crawler: {
            totalRuns: crawlerTotal ?? 0,
            lastRun: lastCrawlerRun
              ? {
                  sourceId: lastCrawlerRun.source_id,
                  status: lastCrawlerRun.status,
                  itemsFetched: lastCrawlerRun.items_fetched,
                  itemsSaved: lastCrawlerRun.items_saved,
                  finishedAt: lastCrawlerRun.finished_at,
                }
              : null,
          },
          dailyRound: {
            dailyId: dailyRound?.daily_id ?? null,
            status: dailyRound?.status ?? null,
            betOpenAt: dailyRound?.bet_open_at ?? null,
            betCloseAt: dailyRound?.bet_close_at ?? null,
            gameCount: dailyRound?.game_count ?? null,
          },
          tickerCount: tickerCount ?? 0,
        }}
      />

      <CrawlerHistory runs={crawlerRuns ?? []} />
    </div>
  )
}
