import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { SAGA_FEEDS, fetchFeed } from "@/lib/saga/sources/rss"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * 사가 수집 cron (W2) — 티커 2차 소비 + 해외 RSS → saga_reservoir 적재만.
 * 발행은 하지 않는다 (HITL 게이트: /admin2/saga 검수가 유일한 발행 경로, W3).
 *
 * 멱등: source_url unique — 재실행·중복 수집 안전 (upsert ignoreDuplicates).
 * VPS 무수정 원칙: 티커를 읽기만 한다 (2026-08-03 오너 확정).
 */

/** 저비용 프리필터 — 명백한 비이적 기사로 저수지가 붇는 것만 막는다 (최종 판정은 extract LLM) */
const TRANSFER_HINT_RE =
  /transfer|sign|deal|bid|offer|fee|move|medical|here we go|done deal|loan|swap|exit|leave|depart|join|mercato|recrute|영입|이적|임대|오피셜|결별|방출|재계약|입단|계약/i

async function cronGet(request: Request) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  {
    const supabase = createServiceRoleClient()
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

    // ── 1. 티커 2차 소비 (transfer/rumor, football, 최근 24h) ──
    const { data: ticker } = await supabase
      .from("news_ticker_items")
      .select(
        "id, original_title, headline_kr, category, link_url, external_url, author, source_id, posted_at"
      )
      .eq("community_slug", "football")
      .in("category", ["transfer", "rumor"])
      .gte("posted_at", cutoff)
      .order("posted_at", { ascending: false })
      .limit(200)

    const rows: {
      source_url: string
      source: Record<string, unknown>
      title: string
      headline_kr: string | null
      occurred_at: string
    }[] = []

    for (const t of ticker ?? []) {
      const url = t.link_url || t.external_url
      const title = t.original_title ?? t.headline_kr
      if (!url || !title) continue
      rows.push({
        source_url: url,
        source: {
          kind: "ticker",
          ticker_id: t.id,
          category: t.category,
          source_id: t.source_id,
          author: t.author,
          link_url: t.link_url,
          external_url: t.external_url,
        },
        title,
        headline_kr: t.headline_kr,
        occurred_at: t.posted_at,
      })
    }
    const tickerCount = rows.length

    // ── 2. 해외 RSS (프리필터 통과분만) ──
    let rssCount = 0
    const feedErrors: string[] = []
    for (const feed of SAGA_FEEDS) {
      try {
        const items = await fetchFeed(feed)
        for (const item of items) {
          if (!TRANSFER_HINT_RE.test(item.title)) continue
          if (new Date(item.publishedAt).toISOString() < cutoff) continue
          rows.push({
            source_url: item.link,
            source: { kind: "rss", feed: feed.key, outlet: feed.outlet, link_url: item.link },
            title: item.title,
            headline_kr: null,
            occurred_at: item.publishedAt,
          })
          rssCount++
        }
      } catch (e) {
        feedErrors.push(`${feed.key}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // ── 3. 멱등 적재 ──
    // ignoreDuplicates upsert 는 .select() 로 삽입분을 돌려주지 않는다 (첫 실행 실측:
    // 47건 들어갔는데 0 보고) — 전후 총건수 차이로 센다
    const countAll = async () => {
      const { count } = await supabase
        .from("saga_reservoir")
        .select("id", { count: "exact", head: true })
      return count ?? 0
    }
    const before = await countAll()
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase
        .from("saga_reservoir")
        .upsert(rows.slice(i, i + 100), { onConflict: "source_url", ignoreDuplicates: true })
      if (error) throw error
    }
    const inserted = (await countAll()) - before

    return NextResponse.json({
      ok: true,
      candidates: { ticker: tickerCount, rss: rssCount },
      inserted,
      feedErrors,
    })
  }
}

export const GET = withCronLog("saga-ingest", cronGet)
