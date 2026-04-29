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

const API_BASE_URL = process.env.API_BASE_URL
if (!API_BASE_URL) {
  throw new Error(
    "API_BASE_URL이 설정되지 않았습니다. 로컬 dev 실행 시 .env에 API_BASE_URL=http://localhost:3000 추가하세요."
  )
}
const CRON_SECRET = process.env.CRON_SECRET
const LEAGUE_IDS_ENV = process.env.LEAGUE_IDS

const NAVER_API = "https://api-gw.sports.naver.com"
const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "ko-KR,ko;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
  Referer: "https://m.sports.naver.com/",
}

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

/** 네이버 API에서 해당 리그의 현재 시즌 코드 조회 (isDefault 우선, 없으면 마지막=최신) */
async function fetchCurrentSeasonCode(categoryId: string): Promise<string | null> {
  const url = `${NAVER_API}/statistics/categories/${categoryId}/seasons`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: { seasons?: { seasonCode: string; isDefault: boolean }[] }
    }
    const seasons = json?.result?.seasons
    if (!Array.isArray(seasons) || seasons.length === 0) return null
    const def = seasons.find((s) => s.isDefault)
    if (def) return def.seasonCode
    return seasons[seasons.length - 1]?.seasonCode ?? null
  } catch {
    return null
  }
}

/** 네이버 API에서 팀 순위 데이터 조회 */
async function fetchTeamsStandings(
  categoryId: string,
  seasonCode: string
): Promise<Record<string, string | number>[]> {
  const url = `${NAVER_API}/statistics/categories/${categoryId}/seasons/${seasonCode}/teams`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      logError(`teams API ${res.status}: ${url}`)
      return []
    }
    const json = (await res.json()) as unknown
    return parseTeamsResponse(json)
  } catch (e) {
    logError(`teams fetch 실패: ${url} — ${e}`)
    return []
  }
}

function parseTeamsResponse(data: unknown): Record<string, string | number>[] {
  if (!data || typeof data !== "object") return []
  const o = data as Record<string, unknown>
  const result = o.result as Record<string, unknown> | undefined

  const arr =
    (result?.seasonTeamStats as unknown[]) ??
    (result?.teams as unknown[]) ??
    (result?.teamRank as unknown[]) ??
    (o.teams as unknown[]) ??
    (o.list as unknown[]) ??
    []

  if (!Array.isArray(arr) || arr.length === 0) return []

  return arr
    .map((row: unknown) => {
      if (!row || typeof row !== "object") return null
      const r = row as Record<string, unknown>
      const teamName = String(
        r.teamName ?? r.name ?? r.team ?? r.clubName ?? r.teamFullName ?? r.teamShortName ?? ""
      )
      const played =
        Number(r.matchesPlayed ?? r.played ?? r.gameCount ?? r.gp ?? r.playedGames ?? 0) || 0
      const points = Number(r.points ?? r.pts ?? r.point ?? 0) || 0
      const gd = Number(r.goalsDifference ?? r.goalDifference ?? r.goalDiff ?? r.gd ?? 0) || 0
      const wins = Number(r.wins ?? r.win ?? r.winGameCount ?? r.w ?? 0) || 0
      const losses = Number(r.losses ?? r.lose ?? r.loseGameCount ?? r.loss ?? r.l ?? 0) || 0
      const draws = Number(r.draws ?? r.draw ?? r.drawnGameCount ?? r.d ?? 0) || 0
      const group = String(r.conf ?? r.league ?? "")
      const division = String(r.division ?? "")
      if (!teamName) return null
      const out: Record<string, string | number> = {
        팀명: teamName,
        경기: played,
        승점: points,
        골득실: gd,
        승: wins,
        패: losses,
        무: draws,
      }
      if (group) out.group = group
      if (division && division !== "null") out.division = division
      return out
    })
    .filter((row): row is Record<string, string | number> => row !== null)
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
