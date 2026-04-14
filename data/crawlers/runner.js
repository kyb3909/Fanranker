/**
 * Unified News Crawler Runner
 *
 * Usage:
 *   node runner.js                        # Run all enabled sources (schedule-aware)
 *   node runner.js --source=reddit-soccer # Run specific source (ignores schedule)
 *   node runner.js --dry-run              # Fetch only, no GPT/DB writes
 *   node runner.js --source=reddit-soccer --dry-run
 *
 * Cron: every 10 min — cd ~/crawlers && node runner.js >> logs/cron.log 2>&1
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

import supabase from './core/db.js'
import { fetchRedditPosts } from './core/reddit-fetcher.js'
import { fetchNaverNewsPosts } from './core/naver-news-fetcher.js'
import { summarizePosts } from './core/summarizer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// --------------- CLI args ---------------
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const sourceFilter = args.find(a => a.startsWith('--source='))?.split('=')[1]

// --------------- Config ---------------
const sources = JSON.parse(
  readFileSync(join(__dirname, 'config/sources.json'), 'utf-8')
)

// --------------- Logging ---------------
const logsDir = join(__dirname, 'logs')
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true })

function log(sourceId, message) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${sourceId}] ${message}\n`
  process.stdout.write(line)
  try {
    appendFileSync(join(logsDir, `${sourceId}.log`), line)
  } catch { /* ignore log write errors */ }
}

// --------------- Schedule helpers ---------------

/** Get last successful run time from DB */
async function getLastRunTime(sourceId) {
  const { data } = await supabase
    .from('crawler_run_log')
    .select('started_at')
    .eq('source_id', sourceId)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.started_at || null
}

/** Count today's successful runs for cost safeguard */
async function getDailyRunCount(sourceId) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('crawler_run_log')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId)
    .eq('status', 'success')
    .gte('started_at', today.toISOString())
  return count || 0
}

/** Check if source should run now */
async function shouldRun(source) {
  // Check daily run limit
  const dailyRuns = await getDailyRunCount(source.id)
  if (dailyRuns >= (source.max_daily_runs || 12)) {
    log(source.id, `Skipped: daily limit reached (${dailyRuns}/${source.max_daily_runs || 12})`)
    return false
  }

  // Check interval
  const lastRun = await getLastRunTime(source.id)
  if (!lastRun) return true

  const elapsedHours =
    (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60)
  if (elapsedHours < (source.interval_hours || 2)) {
    log(source.id, `Skipped: interval not reached (${elapsedHours.toFixed(1)}h / ${source.interval_hours || 2}h)`)
    return false
  }

  return true
}

// --------------- Category → ticker_tag mapping ---------------
function categoryToTag(category, importance) {
  if (['result', 'record'].includes(category)) return 'result'
  return 'breaking'
}

/** 같은 community_slug에 최근 48h 내 올라간 ticker 항목 조회.
 *  summarizer가 cross-source dedupe에 사용. */
async function fetchRecentTickerItems(communitySlug) {
  if (!communitySlug) return []
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('news_ticker_items')
    .select('headline_kr, original_title, importance, posted_at')
    .eq('community_slug', communitySlug)
    .gte('posted_at', cutoff)
    .order('posted_at', { ascending: false })
    .limit(50)
  if (error) {
    // 조회 실패해도 파이프라인은 계속. 빈 배열 반환.
    return []
  }
  const now = Date.now()
  return (data || []).map((r) => ({
    headline_kr: r.headline_kr,
    original_title: r.original_title,
    importance: r.importance,
    hoursAgo: Math.max(0, Math.round((now - new Date(r.posted_at).getTime()) / 3600000)),
  }))
}

// --------------- Source processors ---------------

async function processRedditSource(source) {
  log(source.id, 'Fetching Reddit posts...')
  const posts = await fetchRedditPosts(source)
  log(source.id, `Fetched ${posts.length} posts (min_score=${source.min_score})`)

  if (posts.length === 0) return { fetched: 0, saved: 0 }

  // Check which posts already exist
  const { data: existing } = await supabase
    .from('news_ticker_items')
    .select('external_id')
    .eq('source_id', source.id)
    .in('external_id', posts.map(p => p.external_id))

  const existingIds = new Set((existing || []).map(e => e.external_id))
  const newPosts = posts.filter(p => !existingIds.has(p.external_id))

  if (newPosts.length === 0) {
    log(source.id, 'No new posts to process')
    return { fetched: posts.length, saved: 0 }
  }

  log(source.id, `${newPosts.length} new posts → GPT summarization...`)

  if (dryRun) {
    newPosts.forEach((p, i) => log(source.id, `  [${i + 1}] ${p.original_title.slice(0, 80)}`))
    log(source.id, '[DRY RUN] Skipping GPT & DB')
    return { fetched: posts.length, saved: 0 }
  }

  // Cross-source dedupe 컨텍스트: 같은 community_slug 최근 48h ticker 조회
  const recentItems = await fetchRecentTickerItems(source.community_slug)
  log(source.id, `Recent ticker context: ${recentItems.length} items in last 48h`)

  // GPT summarization
  const summaries = await summarizePosts(newPosts, source, recentItems)
  log(source.id, `GPT returned ${summaries.length} news items`)

  if (summaries.length === 0) return { fetched: posts.length, saved: 0 }

  // Build rows for upsert
  const rows = summaries.map(item => ({
    source_id: source.id,
    community_slug: source.community_slug,
    external_id: item.post.external_id,
    external_url: item.post.external_url,
    original_title: item.post.original_title,
    link_url: item.post.link_url,
    thumbnail_url: item.post.thumbnail_url || null,
    media_type: item.post.media_type || null,
    score: item.post.score,
    num_comments: item.post.num_comments,
    flair: item.post.flair,
    author: item.post.author,
    posted_at: item.post.posted_at,
    category: item.category,
    importance: item.importance,
    headline_kr: item.headline_kr,
    summary_kr: item.summary_lines.join('\n'),
    ticker_tag: categoryToTag(item.category, item.importance),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('news_ticker_items')
    .upsert(rows, { onConflict: 'source_id,external_id' })

  if (error) throw new Error(`DB upsert failed: ${error.message}`)

  log(source.id, `Saved ${rows.length} items to DB`)
  return { fetched: posts.length, saved: rows.length }
}

async function processNaverNewsSource(source) {
  const queryLabel = source.search_queries?.join(', ') || source.search_query || '?'
  log(source.id, `Fetching Naver news (queries="${queryLabel}")...`)
  const posts = await fetchNaverNewsPosts(source)
  log(source.id, `Fetched ${posts.length} articles`)

  if (posts.length === 0) return { fetched: 0, saved: 0 }

  // Check which posts already exist
  const { data: existing } = await supabase
    .from('news_ticker_items')
    .select('external_id')
    .eq('source_id', source.id)
    .in('external_id', posts.map(p => p.external_id))

  const existingIds = new Set((existing || []).map(e => e.external_id))
  const newPosts = posts.filter(p => !existingIds.has(p.external_id))

  if (newPosts.length === 0) {
    log(source.id, 'No new articles to process')
    return { fetched: posts.length, saved: 0 }
  }

  log(source.id, `${newPosts.length} new articles → GPT summarization...`)

  if (dryRun) {
    newPosts.forEach((p, i) => log(source.id, `  [${i + 1}] ${p.original_title.slice(0, 80)}`))
    log(source.id, '[DRY RUN] Skipping GPT & DB')
    return { fetched: posts.length, saved: 0 }
  }

  // Cross-source dedupe 컨텍스트: 같은 community_slug 최근 48h ticker 조회
  const recentItems = await fetchRecentTickerItems(source.community_slug)
  log(source.id, `Recent ticker context: ${recentItems.length} items in last 48h`)

  // GPT summarization
  const summaries = await summarizePosts(newPosts, source, recentItems)
  log(source.id, `GPT returned ${summaries.length} news items`)

  if (summaries.length === 0) return { fetched: posts.length, saved: 0 }

  // Build rows for upsert
  const rows = summaries.map(item => ({
    source_id: source.id,
    community_slug: source.community_slug,
    external_id: item.post.external_id,
    external_url: item.post.external_url,
    original_title: item.post.original_title,
    link_url: item.post.link_url,
    thumbnail_url: item.post.thumbnail_url || null,
    media_type: item.post.media_type || 'article',
    score: 0,
    num_comments: 0,
    flair: null,
    author: item.post.author,
    posted_at: item.post.posted_at,
    category: item.category,
    importance: item.importance,
    headline_kr: item.headline_kr,
    summary_kr: item.summary_lines.join('\n'),
    ticker_tag: categoryToTag(item.category, item.importance),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('news_ticker_items')
    .upsert(rows, { onConflict: 'source_id,external_id' })

  if (error) throw new Error(`DB upsert failed: ${error.message}`)

  log(source.id, `Saved ${rows.length} items to DB`)
  return { fetched: posts.length, saved: rows.length }
}

// --------------- Cleanup ---------------

async function cleanup() {
  const { data, error } = await supabase.rpc('cleanup_old_ticker_items')
  if (!error && data > 0) {
    log('system', `Cleaned up ${data} expired items`)
  }
}

// --------------- Main ---------------

async function main() {
  const t0 = Date.now()
  log('system', `=== Runner started (dry=${dryRun}, source=${sourceFilter || 'all'}) ===`)

  const activeSources = sources.filter(s => {
    if (!s.enabled) return false
    if (sourceFilter && s.id !== sourceFilter) return false
    return true
  })

  if (activeSources.length === 0) {
    log('system', 'No active sources to process')
    return
  }

  log('system', `Sources: ${activeSources.map(s => s.id).join(', ')}`)

  for (const source of activeSources) {
    let runLogId = null

    try {
      // Schedule check (skip when specific source is requested)
      if (!sourceFilter) {
        const ok = await shouldRun(source)
        if (!ok) continue
      }

      // Log run start
      if (!dryRun) {
        const { data: runLog } = await supabase
          .from('crawler_run_log')
          .insert({ source_id: source.id, status: 'running' })
          .select('id')
          .single()
        runLogId = runLog?.id
      }

      // Dispatch by type
      let result
      switch (source.type) {
        case 'reddit':
          result = await processRedditSource(source)
          break
        case 'naver-news':
          result = await processNaverNewsSource(source)
          break
        default:
          log(source.id, `Unknown type "${source.type}", skipping`)
          continue
      }

      // Update run log → success
      if (runLogId) {
        await supabase
          .from('crawler_run_log')
          .update({
            status: 'success',
            finished_at: new Date().toISOString(),
            items_fetched: result.fetched,
            items_saved: result.saved,
          })
          .eq('id', runLogId)
      }
    } catch (err) {
      log(source.id, `ERROR: ${err.message}`)

      // Update run log → error
      if (runLogId) {
        await supabase
          .from('crawler_run_log')
          .update({
            status: 'error',
            finished_at: new Date().toISOString(),
            error_message: err.message?.slice(0, 500),
          })
          .eq('id', runLogId)
      }
    }
  }

  // Cleanup expired items
  if (!dryRun) {
    try {
      await cleanup()
    } catch (e) {
      log('system', `Cleanup error: ${e.message}`)
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  log('system', `=== Runner finished in ${elapsed}s ===`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
