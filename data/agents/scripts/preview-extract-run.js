// data/agents/scripts/preview-extract-run.js
//
// 경기 프리뷰 1단계: soccerway ANALYSIS 추출 (T0, LLM 없음) — docs/PRD-match-preview.md
// pending → extracted | (실패 시 error 기록 후 pending 유지 — 다음 실행에서 재시도)
//
// soccerway 는 SPA + 난독화 피드(x-fsign)라 API 역공학 대신 Playwright headless 로
// 렌더된 본문 innerText 에서 "Pre-Match Analysis:" 앵커 이후를 추출한다.
//
// 사용:
//   node data/agents/scripts/preview-extract-run.js --url="https://www.soccerway.com/match/.../?mid=XXXX"
//   node data/agents/scripts/preview-extract-run.js            (pending 행 일괄 처리)
//   node data/agents/scripts/preview-extract-run.js --dry-run  (DB 갱신 없이 추출 결과만 출력)
//
// VPS 준비물: data/agents 에서 npm install 후 npx playwright install chromium --with-deps

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Vultr 는 셸 env, 로컬은 crawlers/.env — 둘 다 지원 (이미 설정된 값은 dotenv 가 덮지 않음)
config({ path: join(__dirname, '..', '..', 'crawlers', '.env') })

const { default: supabase } = await import('../../crawlers/core/db.js')
const { chromium } = await import('playwright')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const urlArgs = args.filter((a) => a.startsWith('--url=')).map((a) => a.slice(6))

const ANCHOR = 'Pre-Match Analysis:'
const END_MARKER = 'Generated automatically.'
const WAIT_MS = 25000
const BETWEEN_PAGES_MS = 3000

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [preview-extract] ${msg}\n`)
}

function midFromUrl(url) {
  const m = url.match(/[?&]mid=([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

/** "Pre-Match Analysis: {home} vs {away} at {venue} – {league}, {dd.mm.yyyy}" 헤딩 파싱 */
function parseHeading(rawText) {
  const m = rawText.match(/^Pre-Match Analysis:\s*(.+?)\s+vs\s+(.+?)\s+at\s+.+?[–-]\s*(.+?),\s*\d{2}\.\d{2}\.\d{4}/)
  if (!m) return { home: null, away: null, league: null }
  return { home: m[1].trim(), away: m[2].trim(), league: m[3].trim() }
}

async function extractOne(browser, row) {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  })
  try {
    await page.goto(row.soccerway_url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // SPA 하이드레이션 대기 — analysis 텍스트가 innerText 에 나타날 때까지 폴링
    const deadline = Date.now() + WAIT_MS
    let text = ''
    while (Date.now() < deadline) {
      text = await page.evaluate(() => document.body.innerText)
      if (text.includes(ANCHOR)) break
      await page.waitForTimeout(1000)
    }
    if (!text.includes(ANCHOR)) throw new Error('analysis 미생성 (앵커 없음)')

    const start = text.indexOf(ANCHOR)
    const endIdx = text.indexOf(END_MARKER, start)
    const rawText = (endIdx > start ? text.slice(start, endIdx) : text.slice(start, start + 6000)).trim()
    if (rawText.length < 400) throw new Error(`추출 텍스트가 너무 짧음 (${rawText.length}자)`)

    const { home, away, league } = parseHeading(rawText)
    return { rawText, home, away, league }
  } finally {
    await page.close()
  }
}

async function main() {
  log(`dry=${dryRun} urls=${urlArgs.length}`)

  // --url 인자는 pending 행으로 upsert 하고 나서 일괄 처리 (재실행 멱등)
  for (const url of urlArgs) {
    const mid = midFromUrl(url)
    if (!mid) {
      log(`[SKIP] mid 파라미터 없음: ${url}`)
      continue
    }
    if (dryRun) continue
    const { error } = await supabase
      .from('match_previews')
      .upsert({ soccerway_mid: mid, soccerway_url: url }, { onConflict: 'soccerway_mid', ignoreDuplicates: true })
    if (error) log(`[WARN] upsert 실패 (${mid}): ${error.message}`)
  }

  let rows
  if (dryRun && urlArgs.length > 0) {
    rows = urlArgs
      .filter((u) => midFromUrl(u))
      .map((u) => ({ id: null, soccerway_mid: midFromUrl(u), soccerway_url: u }))
  } else {
    const { data, error } = await supabase
      .from('match_previews')
      .select('id, soccerway_mid, soccerway_url')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20)
    if (error) {
      log(`select error: ${error.message}`)
      process.exit(1)
    }
    rows = data
  }
  log(`대상 ${rows.length}건`)
  if (rows.length === 0) return

  const browser = await chromium.launch({ headless: true })
  try {
    for (const row of rows) {
      try {
        const { rawText, home, away, league } = await extractOne(browser, row)
        log(`  OK ${row.soccerway_mid} — ${home} vs ${away} (${league}, ${rawText.length}자)`)
        if (dryRun) {
          log(`    ${rawText.slice(0, 200).replace(/\n/g, ' / ')}`)
          continue
        }
        const { error } = await supabase
          .from('match_previews')
          .update({
            status: 'extracted',
            raw_text: rawText,
            home_team: home,
            away_team: away,
            league,
            error: null,
            audit: [{ at: new Date().toISOString(), stage: 'extract', chars: rawText.length }],
          })
          .eq('id', row.id)
        if (error) log(`  [WARN] update 실패: ${error.message}`)
      } catch (e) {
        log(`  [ERR] ${row.soccerway_mid}: ${e.message}`)
        if (!dryRun && row.id) {
          await supabase.from('match_previews').update({ error: e.message.slice(0, 300) }).eq('id', row.id)
        }
      }
      await new Promise((r) => setTimeout(r, BETWEEN_PAGES_MS))
    }
  } finally {
    await browser.close()
  }
  log('완료')
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})
