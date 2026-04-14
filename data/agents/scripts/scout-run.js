// data/agents/scripts/scout-run.js
//
// Phase A Scout 어댑터: Reddit → news_reservoir
//
// - config/subreddits.json 순회
// - Phase A 자체 RSS fetcher (../core/reddit-fetch.js) 사용 — Node native fetch
// - title_drop_patterns + author_ban_list 룰 필터 적용
// - news_reservoir에 status='ingested'로 INSERT
// - 이미 있는 id는 skip (idempotent)
//
// 사용:
//   node data/agents/scripts/scout-run.js            # 실제 INSERT
//   node data/agents/scripts/scout-run.js --dry-run  # fetch만, DB write 없음

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'
import { fetchRedditViaRSS } from '../core/reddit-fetch.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dirname, '..', 'config', 'subreddits.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  const ts = new Date().toISOString()
  process.stdout.write(`[${ts}] [scout] ${msg}\n`)
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
}

/** "(?i)foo" 또는 "foo" 형태의 JSON regex 문자열을 JS RegExp로 컴파일 */
function compilePatterns(patterns) {
  return patterns
    .map((p) => {
      let flags = ''
      let src = p
      if (src.startsWith('(?i)')) {
        flags = 'i'
        src = src.slice(4)
      }
      try {
        return new RegExp(src, flags)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function shouldDropTitle(title, compiled) {
  for (const re of compiled) {
    if (re.test(title)) return true
  }
  return false
}

/** 트래킹 파라미터 제거 + hash 제거 */
function normalizeUrl(u) {
  try {
    const url = new URL(u)
    url.hash = ''
    for (const k of [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid'
    ]) {
      url.searchParams.delete(k)
    }
    return url.toString()
  } catch {
    return u
  }
}

function hostnameOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').replace(/\.$/, '').toLowerCase()
  } catch {
    return null
  }
}

/** Reddit post → news_reservoir row (status='ingested') */
function toReservoirRow(entry, post) {
  const id = `reddit_${entry.name}_${post.external_id}`

  const socials = []
  if (post.link_url) {
    if (post.media_type === 'article') {
      socials.push({ type: 'article', url: post.link_url })
    } else if (post.media_type === 'youtube') {
      socials.push({ type: 'youtube', url: post.link_url, oembedSupported: true })
    } else if (post.media_type === 'twitter') {
      socials.push({ type: 'twitter', url: post.link_url, oembedSupported: true })
    } else if (post.media_type === 'instagram') {
      socials.push({ type: 'instagram', url: post.link_url, oembedSupported: true })
    } else if (post.media_type === 'image') {
      socials.push({ type: 'image', url: post.link_url })
    }
  }

  // Phase A dedupe key: article URL 있으면 canonical URL, 없으면 reddit id
  // Phase B에서 embedding + entity + topic hash로 강화
  const dedupeKey = post.link_url
    ? `article:${normalizeUrl(post.link_url)}`
    : `reddit:${entry.name}:${post.external_id}`

  const createdUtc = post.posted_at
    ? Math.floor(new Date(post.posted_at).getTime() / 1000)
    : null

  return {
    id,
    source: {
      platform: 'reddit',
      subreddit: entry.name,
      community_slug: entry.community_slug || null,
      postId: post.external_id,
      author: post.author,
      createdUtc,
      flair: post.flair,
      score: post.score ?? 0,
      upvoteRatio: null, // RSS 경로는 upvote ratio 없음
      domain: post.link_url ? hostnameOf(post.link_url) : null,
    },
    urls: {
      reddit: post.external_url,
      article: post.link_url || null,
      socials,
    },
    raw: {
      title: post.original_title,
      // og:description 있으면 사용, 없으면 title fallback
      excerpt: post.description || post.original_title,
      lang: 'en',
    },
    scores: {
      credibility: 0,
      newsworthiness: 0,
    },
    dedupe_key: dedupeKey,
    status: 'ingested',
  }
}

async function main() {
  const cfg = loadConfig()
  const compiled = compilePatterns(cfg.title_drop_patterns || [])
  const bans = new Set(cfg.author_ban_list || [])

  const maxArticles = cfg.scout?.max_per_subreddit ?? 25
  const lookbackHours = cfg.scout?.lookback_hours ?? 24

  log(`dry=${dryRun} subreddits=${cfg.subreddits.length} drop_patterns=${compiled.length} lookback=${lookbackHours}h`)

  const totals = {
    fetched: 0,
    dropped_banned_author: 0,
    dropped_title_pattern: 0,
    dropped_low_score: 0,
    already_in_reservoir: 0,
    would_insert: 0,
    inserted: 0,
    errors: 0,
  }

  for (const entry of cfg.subreddits) {
    log(`r/${entry.name}: fetching (max=${maxArticles})...`)

    let posts
    try {
      posts = await fetchRedditViaRSS(entry.name, { maxArticles, lookbackHours })
    } catch (e) {
      log(`r/${entry.name}: fetch error — ${e.message}`)
      totals.errors++
      continue
    }

    totals.fetched += posts.length
    log(`r/${entry.name}: fetched ${posts.length}`)

    // 룰 기반 드롭 (ban list + title patterns + min_score)
    const minScore = typeof entry.min_score === 'number' ? entry.min_score : 0
    const kept = []
    for (const p of posts) {
      if (bans.has(p.author)) {
        totals.dropped_banned_author++
        continue
      }
      if (shouldDropTitle(p.original_title, compiled)) {
        totals.dropped_title_pattern++
        continue
      }
      if ((p.score ?? 0) < minScore) {
        totals.dropped_low_score = (totals.dropped_low_score || 0) + 1
        continue
      }
      kept.push(p)
    }

    if (kept.length === 0) {
      log(`r/${entry.name}: all filtered by rules`)
      continue
    }

    // reservoir 중복 체크 (id 기반)
    const ids = kept.map((p) => `reddit_${entry.name}_${p.external_id}`)
    const { data: existing, error: selErr } = await supabase
      .from('news_reservoir')
      .select('id')
      .in('id', ids)

    if (selErr) {
      log(`r/${entry.name}: select failed — ${selErr.message}`)
      totals.errors++
      continue
    }

    const existingSet = new Set((existing || []).map((r) => r.id))
    const fresh = kept.filter(
      (p) => !existingSet.has(`reddit_${entry.name}_${p.external_id}`)
    )
    totals.already_in_reservoir += kept.length - fresh.length

    if (fresh.length === 0) {
      log(`r/${entry.name}: all ${kept.length} already in reservoir`)
      continue
    }

    const rows = fresh.map((p) => toReservoirRow(entry, p))

    if (dryRun) {
      totals.would_insert += rows.length
      log(`r/${entry.name}: [DRY] would insert ${rows.length}`)
      for (const r of rows.slice(0, 10)) {
        const dom = r.source.domain ? ` (${r.source.domain})` : ''
        log(`    - ${r.raw.title.slice(0, 90)}${dom}`)
      }
      if (rows.length > 10) log(`    ... (+${rows.length - 10} more)`)
      continue
    }

    // audit entry 부착
    const now = new Date().toISOString()
    for (const r of rows) {
      r.audit = [
        {
          at: now,
          agent: 'reddit_scout',
          action: 'ingest',
          status_to: 'ingested',
          verdict: 'inserted',
        },
      ]
    }

    const { data: inserted, error: insErr } = await supabase
      .from('news_reservoir')
      .insert(rows)
      .select('id')

    if (insErr) {
      log(`r/${entry.name}: INSERT failed — ${insErr.message}`)
      totals.errors++
      continue
    }

    totals.inserted += inserted?.length ?? 0
    log(`r/${entry.name}: inserted ${inserted?.length ?? 0}`)
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) {
    log(`  ${k.padEnd(24)}: ${v}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
