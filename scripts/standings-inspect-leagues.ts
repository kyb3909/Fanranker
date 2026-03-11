#!/usr/bin/env node
/**
 * 네이버 모바일 순위 페이지에서 실제로 호출되는 api-gw URL 수집.
 * 각 리그별로 /statistics/.../teams 형태 URL에서 seasonCode 추출용.
 *
 * 실행: pnpm exec tsx scripts/standings-inspect-leagues.ts
 */

import "dotenv/config"
import { chromium } from "playwright"
import { STANDINGS_LEAGUES, getStandingsScrapeUrl } from "../lib/standings/naver-leagues"
import * as fs from "fs"
import * as path from "path"

const results: Record<string, { url: string; apiUrls: string[]; teamsUrl: string | null }> = {}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    locale: "ko-KR",
  })
  const page = await context.newPage()

  for (const league of STANDINGS_LEAGUES) {
    const scrapeUrl = getStandingsScrapeUrl(league.id)
    if (!scrapeUrl) continue

    const apiUrls: string[] = []
    let teamsUrl: string | null = null

    page.on("response", (res) => {
      const u = res.url()
      if (res.request().resourceType() === "document") return
      try {
        const parsed = new URL(u)
        if (parsed.hostname !== "api-gw.sports.naver.com") return
        apiUrls.push(u)
        if (u.includes("/statistics/") && u.includes("/teams")) teamsUrl = u
      } catch {
        // ignore
      }
    })

    console.log(`[${league.id}] ${league.name} ... ${scrapeUrl}`)
    await page.goto(scrapeUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.waitForTimeout(3000)

    results[league.id] = { url: scrapeUrl, apiUrls: [...apiUrls], teamsUrl }
    if (teamsUrl) console.log(`  → teams: ${teamsUrl}`)
    else if (apiUrls.length > 0)
      console.log(`  → api-gw (no /teams): ${apiUrls.slice(0, 3).join(" | ")}`)
    else console.log("  → api-gw 없음")

    page.removeAllListeners("response")
    await page.waitForTimeout(500)
  }

  await context.close()
  await browser.close()

  const outPath = path.join(process.cwd(), "standings-inspect-result.json")
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8")
  console.log("\n저장:", outPath)

  console.log("\n=== seasonCode 후보 (URL path 기준) ===")
  for (const [id, r] of Object.entries(results)) {
    if (!r.teamsUrl) continue
    const m = r.teamsUrl.match(/\/seasons\/([^/]+)\/teams/)
    if (m) console.log(`${id}: "${m[1]}"`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
