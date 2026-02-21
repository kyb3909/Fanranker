import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { TickerManagement } from './ticker-management'
import { CrawlerStatus } from './crawler-status'

export const metadata: Metadata = { title: "뉴스 티커 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminTickerPage() {
  const supabase = createServiceRoleClient()

  const [
    { data: items, count },
    { data: lastCrawlerRun },
    { count: crawlerTotal },
  ] = await Promise.all([
    supabase
      .from('news_ticker_items')
      .select('id, source_id, community_slug, headline_kr, original_title, importance, category, ticker_tag, posted_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 29),
    supabase
      .from('crawler_run_log')
      .select('source_id, status, items_fetched, items_saved, finished_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('crawler_run_log')
      .select('*', { count: 'exact', head: true }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">뉴스 티커 관리</h1>
        <p className="text-sm text-muted-foreground">뉴스 티커 아이템과 크롤러 상태를 관리합니다.</p>
      </div>

      <CrawlerStatus
        data={{
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
        }}
      />

      <TickerManagement initialItems={items ?? []} total={count ?? 0} />
    </div>
  )
}
