import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SystemHealthCards } from "./system-health-cards"
import { CrawlerHistory } from "./crawler-history"
import { CronMonitor, CRON_JOBS, type CronLastRun } from "./cron-monitor"
import { ApiHealthStrip } from "./api-health-strip"
import { QueueBacklogCard } from "./queue-backlog-card"
import { ApiCostCard, type ApiCostData } from "./api-cost-card"

export const metadata: Metadata = { title: "시스템 상태" }
export const dynamic = "force-dynamic"

export default async function AdminSystemPage() {
  const supabase = createServiceRoleClient()

  const cronJobs = await Promise.all(
    CRON_JOBS.map(async (job) => {
      const { data } = await supabase
        .from("cron_run_log")
        .select("status, http_status, error_message, duration_ms, started_at")
        .eq("job_name", job.name)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      return { ...job, lastRun: (data as CronLastRun | null) ?? null }
    })
  )

  const [
    { data: syncState },
    { data: crawlerRuns },
    { count: crawlerTotal },
    { data: dailyRound },
    { count: tickerCount },
    { count: queueBacklog },
    { data: oldestQueued },
  ] = await Promise.all([
    supabase
      .from("betman_sync_state")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crawler_run_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
    supabase.from("crawler_run_log").select("*", { count: "exact", head: true }),
    supabase
      .from("betman_daily_rounds")
      .select("*")
      .order("daily_id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("news_ticker_items").select("*", { count: "exact", head: true }),
    supabase
      .from("temperature_update_queue")
      .select("*", { count: "exact", head: true })
      .is("processed_at", null),
    supabase
      .from("temperature_update_queue")
      .select("queued_at")
      .is("processed_at", null)
      .order("queued_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const lastCrawlerRun = crawlerRuns?.[0] ?? null

  // 외부 유료 API 비용 — 집계는 SQL 한 곳에서 (RPC). 실패해도 페이지는 뜬다.
  const { data: costRaw } = await supabase.rpc("api_cost_summary")
  const cost = (costRaw ?? null) as ApiCostData | null

  return (
    <main id="main-content" tabIndex={-1} className="space-y-8 p-6">
      <div>
        <h1 className="text-foreground text-2xl font-bold">시스템 상태</h1>
        <p className="text-muted-foreground text-sm">
          서비스 동기화 및 크롤러 상태를 모니터링합니다.
        </p>
      </div>

      {cost && <ApiCostCard data={cost} />}

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

      <div className="grid gap-4 md:grid-cols-2">
        <QueueBacklogCard
          backlog={queueBacklog ?? 0}
          oldestQueuedAt={oldestQueued?.queued_at ?? null}
        />
      </div>

      <CronMonitor jobs={cronJobs} />

      <ApiHealthStrip />

      <CrawlerHistory runs={crawlerRuns ?? []} />
    </main>
  )
}
