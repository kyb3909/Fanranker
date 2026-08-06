#!/usr/bin/env node
/**
 * 순위표 스크래퍼 — 네이버 api-gw 직접 호출 방식
 *
 * 1) /statistics/categories/{id}/seasons → 현재 시즌 코드 조회
 * 2) /statistics/categories/{id}/seasons/{code}/teams → 팀 순위 조회
 * 3) ingest API로 저장
 *
 * Playwright 불필요. 순수 fetch만 사용.
 */

import "dotenv/config"
import { STANDINGS_LEAGUES } from "../lib/standings/naver-leagues"
// fetch/파싱은 Vercel cron(standings-refresh)과 공유 — lib/standings/naver-fetch.ts (2026-08-06 추출)
import { fetchCurrentSeasonCode, fetchTeamsStandings } from "../lib/standings/naver-fetch"

const API_BASE_URL = process.env.API_BASE_URL
if (!API_BASE_URL) {
  throw new Error(
    "API_BASE_URL이 설정되지 않았습니다. 로컬 dev 실행 시 .env에 API_BASE_URL=http://localhost:3000 추가하세요."
  )
}
const CRON_SECRET = process.env.CRON_SECRET
const LEAGUE_IDS_ENV = process.env.LEAGUE_IDS

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function logError(msg: string) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`)
}

function getLeaguesToScrape() {
  if (!LEAGUE_IDS_ENV?.trim()) return STANDINGS_LEAGUES
  const ids = new Set(
    LEAGUE_IDS_ENV.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return STANDINGS_LEAGUES.filter((l) => ids.has(l.id))
}

async function sendToIngest(
  leagueId: string,
  rows: Record<string, string | number>[]
): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/cron/standings/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({
      leagueId,
      rows,
      fetchedAt: new Date().toISOString(),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    logError(`ingest 실패 ${res.status}: ${text}`)
    return false
  }
  return true
}

async function main() {
  const leagues = getLeaguesToScrape()
  if (leagues.length === 0) {
    log("수집할 리그가 없습니다.")
    return
  }
  if (!CRON_SECRET) {
    logError("CRON_SECRET 환경 변수를 설정하세요.")
    process.exit(1)
  }

  log(`시작: ${leagues.length}개 리그`)
  let ok = 0
  let fail = 0

  for (const league of leagues) {
    const categoryId = league.category ?? league.id
    let seasonCode = league.seasonCode ?? null

    if (!seasonCode) {
      seasonCode = await fetchCurrentSeasonCode(categoryId)
      if (seasonCode) {
        log(`[${league.id}] 시즌 코드 조회: ${seasonCode}`)
      }
    }

    if (!seasonCode) {
      logError(`[${league.id}] 시즌 코드를 찾을 수 없음`)
      fail++
      continue
    }

    log(`[${league.id}] ${league.name} 수집 중 (season=${seasonCode})`)
    const rows = await fetchTeamsStandings(categoryId, seasonCode)

    if (rows.length === 0) {
      logError(`[${league.id}] 데이터 없음`)
      fail++
      continue
    }

    const sent = await sendToIngest(league.id, rows)
    if (sent) {
      log(`[${league.id}] → ${rows.length}팀 저장 완료`)
      ok++
    } else {
      fail++
    }

    await new Promise((r) => setTimeout(r, 300))
  }

  log(`완료: 성공 ${ok}, 실패 ${fail}`)
  process.exit(fail > 0 && ok === 0 ? 1 : 0)
}

main().catch((e) => {
  logError(`fatal: ${e}`)
  process.exit(1)
})
