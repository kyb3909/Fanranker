// data/agents/scripts/agg-scout-run.js
//
// 커뮤니티 애그리게이터 1단계: 인기글 목록 수집 (T0, LLM 없음)
// (없음) → ingested
//
// 소스별 인기글 목록을 긁어 정치/민감 필터를 거친 뒤 agg_reservoir에 INSERT.
// source_url UNIQUE로 멱등 — 재실행해도 중복 수집 안됨.
//
// 사용:
//   node data/agents/scripts/agg-scout-run.js
//   node data/agents/scripts/agg-scout-run.js --dry-run   (DB 안 씀, 파싱 결과만 출력)
//   node data/agents/scripts/agg-scout-run.js --source=theqoo

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'aggregator.json'), 'utf8'))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [agg-scout] ${msg}\n`)
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

/** 정치/민감 필터. true = 차단 */
function isBlocked(title, category) {
  const { blockedCategories, blockedKeywords, blockedKeywordsEn } = CONFIG.filter
  if (category && blockedCategories.some((c) => category.includes(c))) return true
  if (blockedKeywords.some((k) => title.includes(k))) return true
  // 영문 소스(reddit)용 — 단어 경계 매칭 (substring이면 "war"가 "award"를 잡음)
  if (blockedKeywordsEn?.length) {
    const re = new RegExp(`\\b(${blockedKeywordsEn.join('|')})\\b`, 'i')
    if (re.test(title)) return true
  }
  return false
}

/* ── 시의성 필터 ──
 * 목록의 시각 셀("21:27" = 오늘 KST, "07.21" 같은 날짜 = 어제 이전)을 보고
 * 최근 freshnessMinutes 안에 올라온 글만 통과. 자정 직후 어제 글도 처리. */
function isFresh(timeText) {
  const m = timeText.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return false // 날짜 표기 = 오늘 글 아님
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const nowMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()
  const postMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  let diff = nowMin - postMin
  if (diff < -5) diff += 1440 // 자정 넘김 (목록 23:50, 지금 00:10)
  return diff >= 0 && diff <= CONFIG.limits.freshnessMinutes
}

/* ── 소스별 파서 ── */

/** 더쿠 핫게: <td class="cate"><span>이슈</span></td> ... <td class="title"><a href="/hot/ID">제목</a> ... <td class="time">21:27</td> */
function parseTheqoo(html) {
  const items = []
  const rowRe =
    /<td class="cate"><span>([^<]*)<\/span><\/td>[\s\S]*?<td class="title">\s*<a href="(\/hot\/\d+)">([\s\S]*?)<\/a>[\s\S]*?<td class="time">\s*([^<]*?)\s*<\/td>/g
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const category = decodeEntities(m[1])
    const path = m[2]
    const title = decodeEntities(m[3].replace(/<[^>]+>/g, ''))
    const timeText = m[4].trim()
    if (!title) continue
    items.push({
      source: 'theqoo',
      source_url: `https://theqoo.net${path}`,
      source_title: title,
      category,
      _timeText: timeText,
    })
  }
  return items
}

const PARSERS = { theqoo: parseTheqoo }

async function fetchList(sourceKey, sourceCfg) {
  const res = await fetch(sourceCfg.listUrl, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
  })
  if (!res.ok) throw new Error(`${sourceKey} list HTTP ${res.status}`)
  return res.text()
}

/* ── Reddit (비주얼 서브레딧) ──
 * Reddit 은 Node fetch 의 TLS 핑거프린트를 차단 (JSON API 403) — 기존 뉴스 크롤러의
 * RSS+curl 파서(crawlers/core/reddit-fetcher.js)를 재사용한다. RSS 라 score 필터는 없음
 * (hot 정렬 자체가 품질 프록시). 직접 이미지 링크(i.redd.it 등)가 있는 글만 수집 —
 * 갤러리/영상은 RSS 에서 식별 불가라 스킵. fetch 단계는 reddit 이면 rehost 만 수행. */
async function scoutReddit(cfg) {
  const { fetchRedditPosts } = await import('../../crawlers/core/reddit-fetcher.js')
  const items = []
  let first = true
  for (const sub of cfg.subreddits || []) {
    // 연속 요청은 레이트리밋(RSS blocked)에 걸림 — 서브레딧 간 5초 간격
    if (!first) await new Promise((r) => setTimeout(r, 5000))
    first = false
    try {
      let posts
      try {
        posts = await fetchRedditPosts({ subreddit: sub, max_articles: cfg.perSub || 3 })
      } catch {
        // 간헐 차단 — 10초 후 1회 재시도
        await new Promise((r) => setTimeout(r, 10000))
        posts = await fetchRedditPosts({ subreddit: sub, max_articles: cfg.perSub || 3 })
      }
      let picked = 0
      for (const p of posts) {
        if (p.media_type !== 'image' || !p.link_url) continue // 비주얼 소스 — 이미지 글만
        items.push({
          source: 'reddit',
          source_url: p.external_url,
          source_title: p.original_title,
          category: `r/${sub}`,
          _skipFresh: true, // RSS 파서가 24h 윈도우 필터 수행
          _media: [{ type: 'image', url: p.link_url }],
          _excerpt: p.original_title,
        })
        picked++
      }
      log(`  reddit r/${sub}: ${picked}건 (이미지 글만)`)
    } catch (e) {
      log(`  [ERR] reddit r/${sub}: ${e.message}`)
    }
  }
  return items
}

async function main() {
  log(`dry=${dryRun} source=${sourceArg ?? 'all-enabled'}`)

  const collected = []
  for (const [key, cfg] of Object.entries(CONFIG.sources)) {
    if (sourceArg && key !== sourceArg) continue
    if (!sourceArg && !cfg.enabled) continue
    if (key === 'reddit') {
      collected.push(...(await scoutReddit(cfg)))
      continue
    }
    const parser = PARSERS[key]
    if (!parser) {
      log(`  [SKIP] ${key}: 파서 미구현`)
      continue
    }
    try {
      const html = await fetchList(key, cfg)
      const items = parser(html).slice(0, CONFIG.limits.scoutPerRun)
      log(`  ${key}: ${items.length}건 파싱`)
      collected.push(...items)
    } catch (e) {
      log(`  [ERR] ${key}: ${e.message}`)
    }
  }

  const passed = []
  let blocked = 0
  let stale = 0
  for (const item of collected) {
    if (!item._skipFresh && !isFresh(item._timeText || '')) {
      stale++
      if (dryRun) log(`  [STALE] (${item._timeText}) ${item.source_title.slice(0, 40)}`)
      continue
    }
    if (isBlocked(item.source_title, item.category)) {
      blocked++
      if (dryRun) log(`  [BLOCK] [${item.category}] ${item.source_title}`)
      continue
    }
    delete item._timeText
    passed.push(item)
  }
  log(`필터: ${collected.length}건 중 통과 ${passed.length} / 신선도 탈락 ${stale} / 키워드 차단 ${blocked}`)

  if (dryRun) {
    for (const item of passed) log(`  [PASS] [${item.category}] ${item.source_title}`)
    return
  }

  const { default: supabase } = await import('../../crawlers/core/db.js')
  let inserted = 0
  for (const item of passed) {
    // reddit 은 scout 에서 media/excerpt 까지 확보 — fetch 단계는 rehost 만 수행
    const { _media, _excerpt, _skipFresh, ...rest } = item
    const { error } = await supabase.from('agg_reservoir').insert({
      ...rest,
      ...(_media ? { media: _media, body_excerpt: _excerpt } : {}),
      status: 'ingested',
      audit: [{ at: new Date().toISOString(), stage: 'scout', category: item.category }],
    })
    if (error) {
      if (error.code === '23505') continue // 이미 수집됨 (멱등)
      log(`  [ERR] insert ${item.source_url}: ${error.message}`)
      continue
    }
    inserted++
  }
  log(`신규 ${inserted}건 (중복 ${passed.length - inserted}건 스킵)`)
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})
