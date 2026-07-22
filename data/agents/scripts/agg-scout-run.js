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
  const { blockedCategories, blockedKeywords } = CONFIG.filter
  if (category && blockedCategories.some((c) => category.includes(c))) return true
  return blockedKeywords.some((k) => title.includes(k))
}

/* ── 소스별 파서 ── */

/** 더쿠 핫게: <td class="cate"><span>이슈</span></td> ... <td class="title"><a href="/hot/ID">제목</a> */
function parseTheqoo(html) {
  const items = []
  const rowRe =
    /<td class="cate"><span>([^<]*)<\/span><\/td>[\s\S]*?<td class="title">\s*<a href="(\/hot\/\d+)">([\s\S]*?)<\/a>/g
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const category = decodeEntities(m[1])
    const path = m[2]
    const title = decodeEntities(m[3].replace(/<[^>]+>/g, ''))
    if (!title) continue
    items.push({
      source: 'theqoo',
      source_url: `https://theqoo.net${path}`,
      source_title: title,
      category,
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

async function main() {
  log(`dry=${dryRun} source=${sourceArg ?? 'all-enabled'}`)

  const collected = []
  for (const [key, cfg] of Object.entries(CONFIG.sources)) {
    if (sourceArg && key !== sourceArg) continue
    if (!sourceArg && !cfg.enabled) continue
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
  for (const item of collected) {
    if (isBlocked(item.source_title, item.category)) {
      blocked++
      if (dryRun) log(`  [BLOCK] [${item.category}] ${item.source_title}`)
      continue
    }
    passed.push(item)
  }
  log(`필터: ${collected.length}건 중 통과 ${passed.length} / 차단 ${blocked}`)

  if (dryRun) {
    for (const item of passed) log(`  [PASS] [${item.category}] ${item.source_title}`)
    return
  }

  const { default: supabase } = await import('../../crawlers/core/db.js')
  let inserted = 0
  for (const item of passed) {
    const { error } = await supabase.from('agg_reservoir').insert({
      ...item,
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
