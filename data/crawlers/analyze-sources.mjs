/**
 * 크롤러 소스 지분율 분석기
 * 각 게시판별 키워드/소스가 가져오는 기사 비율을 시각화
 *
 * Usage: node analyze-sources.mjs
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sources = JSON.parse(readFileSync(join(__dirname, 'config/sources.json'), 'utf-8'))

const NAVER_API_URL = 'https://openapi.naver.com/v1/search/news.json'
const REDDIT_BASE = 'https://www.reddit.com'

const naverHeaders = {
  'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
  'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
}

const cutoff = Date.now() - 24 * 60 * 60 * 1000

// ─── Helpers ───

function bar(ratio, width = 25) {
  const filled = Math.round(ratio * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pctColor(pct) {
  if (pct >= 30) return `\x1b[32m${pct.toFixed(1).padStart(5)}%\x1b[0m`
  if (pct >= 10) return `\x1b[33m${pct.toFixed(1).padStart(5)}%\x1b[0m`
  return `\x1b[31m${pct.toFixed(1).padStart(5)}%\x1b[0m`
}

function countColor(n) {
  if (n >= 10) return `\x1b[32m${String(n).padStart(3)}\x1b[0m`
  if (n >= 3) return `\x1b[33m${String(n).padStart(3)}\x1b[0m`
  return `\x1b[31m${String(n).padStart(3)}\x1b[0m`
}

async function getNaverCount(query) {
  try {
    const url = `${NAVER_API_URL}?${new URLSearchParams({ query, display: '50', start: '1', sort: 'date' })}`
    const res = await fetch(url, { headers: naverHeaders })
    const data = await res.json()
    return (data.items || []).filter(i => {
      const t = new Date(i.pubDate).getTime()
      if (t < cutoff) return false
      const link = i.originallink || i.link || ''
      if (link.includes('blog.naver.com') || link.includes('cafe.naver.com') || link.includes('tistory.com')) return false
      return true
    }).length
  } catch {
    return 0
  }
}

async function getRedditCount(subreddit) {
  try {
    const url = `${REDDIT_BASE}/r/${subreddit}/hot.rss?limit=50`
    const res = await fetch(url, { headers: { 'User-Agent': 'source-analyzer/1.0' } })
    if (!res.ok) return 0
    const xml = await res.text()
    const entries = xml.match(/<entry>/g)
    return entries ? entries.length : 0
  } catch {
    return 0
  }
}

// ─── Main ───

const communityNames = {
  football: '⚽ 축구',
  baseball: '⚾ 야구',
  basketball: '🏀 농구',
  volleyball: '🏐 배구',
  game: '🎮 게임',
  movies: '🎬 영화/드라마',
  music: '🎵 음악',
  idol: '🌟 아이돌',
  anime: '📺 애니/만화',
  'free-board': '💬 자유게시판',
}

// Group sources by community
const communities = {}
for (const s of sources.filter(s => s.enabled)) {
  if (!communities[s.community_slug]) communities[s.community_slug] = []
  communities[s.community_slug].push(s)
}

console.log('\n\x1b[1m╔════════════════════════════════════════════════════════════════════════╗\x1b[0m')
console.log('\x1b[1m║                    📊 크롤러 소스 지분율 분석                          ║\x1b[0m')
console.log('\x1b[1m╚════════════════════════════════════════════════════════════════════════╝\x1b[0m')

// Per-community summary for final table
const summaryData = []

for (const [slug, srcs] of Object.entries(communities)) {
  const label = communityNames[slug] || slug

  console.log(`\n\x1b[1;36m┌─ ${label} ${'─'.repeat(60)}\x1b[0m`)

  const results = []

  // Fetch counts in parallel per community
  const fetchPromises = []

  for (const src of srcs) {
    if (src.type === 'reddit') {
      fetchPromises.push(
        getRedditCount(src.subreddit).then(rawCount => {
          // Apply max_articles cap to reflect actual operation
          const effective = Math.min(rawCount, src.max_articles || 10)
          results.push({
            type: 'Reddit',
            label: `r/${src.subreddit}`,
            rawCount,
            effective,
            runsPerDay: src.max_daily_runs || 12,
            interval: src.interval_hours || 2,
            category: src.prompt_category,
          })
        })
      )
    } else if (src.type === 'naver-news') {
      const queries = src.search_queries || [src.search_query]
      const maxPerQuery = Math.ceil((src.max_articles || 10) / queries.length)
      for (const q of queries) {
        fetchPromises.push(
          getNaverCount(q).then(rawCount => {
            const effective = Math.min(rawCount, maxPerQuery)
            results.push({
              type: 'Naver',
              label: `"${q}"`,
              rawCount,
              effective,
              runsPerDay: src.max_daily_runs || 8,
              interval: src.interval_hours || 3,
              category: src.prompt_category,
            })
          })
        )
      }
    }
  }

  await Promise.all(fetchPromises)

  const totalRaw = results.reduce((s, r) => s + r.rawCount, 0) || 1
  const totalEffective = results.reduce((s, r) => s + r.effective, 0) || 1

  // Sort by effective desc
  results.sort((a, b) => b.effective - a.effective)

  // Header
  console.log(`│  \x1b[2mSource                     실제기사 지분율                         원본  설정\x1b[0m`)
  console.log(`│  \x1b[2m${'─'.repeat(72)}\x1b[0m`)

  for (const r of results) {
    const pct = (r.effective / totalEffective) * 100
    const icon = r.type === 'Reddit' ? '🔶' : '🟢'
    const labelStr = r.label.padEnd(20)
    const effectiveStr = countColor(r.effective)
    const rawStr = `\x1b[2m(${r.rawCount})\x1b[0m`.padEnd(20)
    const configStr = `\x1b[2m${r.interval}h·${r.runsPerDay}/d\x1b[0m`
    console.log(`│  ${icon} ${labelStr} ${effectiveStr}건 ${bar(r.effective / totalEffective)} ${pctColor(pct)} ${rawStr} ${configStr}`)
  }

  // Reddit vs Naver breakdown
  const redditEffective = results.filter(r => r.type === 'Reddit').reduce((s, r) => s + r.effective, 0)
  const naverEffective = results.filter(r => r.type === 'Naver').reduce((s, r) => s + r.effective, 0)
  const redditPct = totalEffective > 0 ? (redditEffective / totalEffective * 100) : 0
  const naverPct = totalEffective > 0 ? (naverEffective / totalEffective * 100) : 0

  console.log(`│  \x1b[2m${'─'.repeat(72)}\x1b[0m`)
  if (naverEffective > 0 && redditEffective > 0) {
    console.log(`│  해외/국내 비율: 🔶 ${redditPct.toFixed(0)}% vs 🟢 ${naverPct.toFixed(0)}%  │  총 ${totalEffective}건 (${results.length}개 소스)`)
  } else if (naverEffective > 0) {
    console.log(`│  국내 전용: 🟢 100%  │  총 ${totalEffective}건 (${results.length}개 소스)`)
  } else {
    console.log(`│  해외 전용: 🔶 100%  │  총 ${totalEffective}건 (${results.length}개 소스)`)
  }
  console.log(`\x1b[1;36m└${'─'.repeat(72)}\x1b[0m`)

  summaryData.push({
    slug,
    label,
    redditSources: results.filter(r => r.type === 'Reddit').length,
    naverSources: results.filter(r => r.type === 'Naver').length,
    redditEffective,
    naverEffective,
    totalEffective,
    redditPct,
    naverPct,
  })
}

// ─── Summary Table ───

console.log(`\n\x1b[1m╔════════════════════════════════════════════════════════════════════════╗\x1b[0m`)
console.log(`\x1b[1m║                         📋 전체 요약                                  ║\x1b[0m`)
console.log(`\x1b[1m╠════════════════════════════════════════════════════════════════════════╣\x1b[0m`)
console.log(`\x1b[1m║  게시판          │ 소스  │ 해외(Reddit)    │ 국내(Naver)     │  총    ║\x1b[0m`)
console.log(`\x1b[1m╠════════════════════════════════════════════════════════════════════════╣\x1b[0m`)

let grandReddit = 0, grandNaver = 0, grandTotal = 0

for (const d of summaryData) {
  const name = d.label.padEnd(14)
  const srcCount = `${d.redditSources}+${d.naverSources}`.padStart(4)
  const redditStr = d.redditEffective > 0 ? `${String(d.redditEffective).padStart(3)}건 (${d.redditPct.toFixed(0).padStart(3)}%)` : `  -       `
  const naverStr = d.naverEffective > 0 ? `${String(d.naverEffective).padStart(3)}건 (${d.naverPct.toFixed(0).padStart(3)}%)` : `  -       `
  const totalStr = String(d.totalEffective).padStart(4)
  console.log(`║  ${name} │ ${srcCount} │ ${redditStr}  │ ${naverStr}  │ ${totalStr}건 ║`)
  grandReddit += d.redditEffective
  grandNaver += d.naverEffective
  grandTotal += d.totalEffective
}

console.log(`\x1b[1m╠════════════════════════════════════════════════════════════════════════╣\x1b[0m`)
const grandRedditPct = grandTotal > 0 ? (grandReddit / grandTotal * 100).toFixed(0) : 0
const grandNaverPct = grandTotal > 0 ? (grandNaver / grandTotal * 100).toFixed(0) : 0
console.log(`\x1b[1m║  합계            │ ${String(summaryData.reduce((s,d)=>s+d.redditSources+d.naverSources,0)).padStart(4)} │ ${String(grandReddit).padStart(3)}건 (${String(grandRedditPct).padStart(3)}%)  │ ${String(grandNaver).padStart(3)}건 (${String(grandNaverPct).padStart(3)}%)  │ ${String(grandTotal).padStart(4)}건 ║\x1b[0m`)
console.log(`\x1b[1m╚════════════════════════════════════════════════════════════════════════╝\x1b[0m`)

console.log(`\n\x1b[2m🔶 Reddit (해외)  🟢 Naver News (국내)  │  24시간 기준 · max_articles 반영\x1b[0m\n`)
