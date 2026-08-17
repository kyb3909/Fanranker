import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"

/**
 * 일정 페이지 데이터 — **매치데이 하루**의 대상 리그 경기 전부 (2026-08-17 개정).
 *
 * ⚠️ 달력일(KST 00:00~24:00)로 자르면 안 된다 — 유럽 경기가 한국 새벽이라 토요일
 *    라운드가 토/일 두 날짜로 찢어진다 (2026-08-17 운영자: "시차 때문에 15/16일,
 *    16/17일 이런 식으로 묶어서 보여주는 게 맞다"). 그래서 경계를 **KST 06:00** 에 둔다:
 *    한 창은 KST 06:00 ~ 다음날 06:00 이고, 그 안에 K리그 낮경기(14:00) → 유럽 저녁
 *    (23:00~) → MLS 새벽(04:00)까지 하루치 축구가 통째로 들어온다.
 *    화면 라벨은 "8월 16-17일" 처럼 두 날짜를 함께 보여준다.
 *
 * 베팅 데일리 윈도우(08:00~08:00, 23:00 flip)와는 여전히 별개다 — 그쪽은 정산 기준이고
 * 여기는 열람 기준이다.
 *
 * 상태·스코어는 마켓별 다중 row 를 경기 단위로 접는다 (get-match.ts 와 같은 규칙:
 * 상태는 completed > in_progress > cancelled > scheduled, 스코어는 값 있는 row 우선).
 */

/** 매치데이 시작 시각 (KST) — 이 시각 이전 경기는 전날 매치데이 소속 */
export const MATCHDAY_START_HOUR_KST = 6

export interface FixtureRow {
  matchKey: string
  gameId: string
  homeTeam: string
  awayTeam: string
  leagueCode: string
  matchTime: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  homeScore: number | null
  awayScore: number | null
}

const STATUS_RANK = { completed: 3, in_progress: 2, cancelled: 1, scheduled: 0 } as const

/** "YYYY-MM-DD"(매치데이 시작일) → UTC 범위 [그날 06:00 KST, +24h) */
export function kstDayRange(dateKst: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKst)) return null
  const hh = String(MATCHDAY_START_HOUR_KST).padStart(2, "0")
  const start = new Date(`${dateKst}T${hh}:00:00+09:00`)
  if (Number.isNaN(start.getTime())) return null
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 3600_000).toISOString(),
  }
}

/**
 * 지금이 속한 매치데이의 시작일 "YYYY-MM-DD".
 * KST 06:00 이전이면 아직 전날 매치데이다 — 새벽 4시에 보는 유럽 경기는 "어제 라운드".
 */
export function todayKst(): string {
  const kstMs = Date.now() + 9 * 3600_000 - MATCHDAY_START_HOUR_KST * 3600_000
  return new Date(kstMs).toISOString().slice(0, 10)
}

/** 매치데이 시작일 → 종료일 ("2026-08-16" → "2026-08-17") */
export function matchdayEndDate(dateKst: string): string {
  const d = new Date(`${dateKst}T12:00:00+09:00`)
  return new Date(d.getTime() + 24 * 3600_000).toISOString().slice(0, 10)
}

async function fetchFixturesForDay(dateKst: string): Promise<FixtureRow[]> {
  const range = kstDayRange(dateKst)
  if (!range) return []
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from("betman_games")
    .select(
      "id, home_team_name, away_team_name, league_code, match_time, status, home_score, away_score"
    )
    .eq("sport", "축구")
    .in("league_code", [...MATCH_PAGE_LEAGUES])
    .gte("match_time", range.start)
    .lt("match_time", range.end)
    .neq("home_team_name", "미정")
    .not("home_team_name", "is", null)

  const byKey = new Map<string, FixtureRow>()
  for (const g of data ?? []) {
    const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
    const status = g.status as FixtureRow["status"]
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, {
        matchKey: key,
        gameId: String(g.id),
        homeTeam: String(g.home_team_name),
        awayTeam: String(g.away_team_name),
        leagueCode: String(g.league_code ?? ""),
        matchTime: String(g.match_time),
        status,
        homeScore: g.home_score != null ? Number(g.home_score) : null,
        awayScore: g.away_score != null ? Number(g.away_score) : null,
      })
      continue
    }
    // 상태는 가장 진행된 값, 스코어는 값 있는 row 우선
    if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[prev.status] ?? 0)) prev.status = status
    if (prev.homeScore == null && g.home_score != null) {
      prev.homeScore = Number(g.home_score)
      prev.awayScore = g.away_score != null ? Number(g.away_score) : null
    }
  }

  return [...byKey.values()].sort((a, b) => a.matchTime.localeCompare(b.matchTime))
}

/** 60초 Data Cache (날짜별 키) — LIVE 스코어가 크게 뒤처지지 않는 선 */
export function getFixturesForDay(dateKst: string): Promise<FixtureRow[]> {
  return unstable_cache(() => fetchFixturesForDay(dateKst), ["fixtures-day", dateKst], {
    revalidate: 60,
  })()
}
