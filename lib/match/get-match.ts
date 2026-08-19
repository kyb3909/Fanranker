import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isMatchPageLeague } from "@/lib/match/leagues"

/**
 * 매치 페이지 데이터 — betman_games 만으로 조립하는 경기 요약 (2026-08-16, 표시 전용).
 *
 * ## URL 키 = 마켓 row 의 game_id (uuid)
 * 한 경기는 마켓별 다중 row 라 "경기 id"가 따로 없다(fixtures 테이블은 실록 단계 3).
 * 어느 row 의 id 로 들어와도 (home, away, match_time) 형제 확장으로 같은 경기를 찾으므로
 * 사이트 내부 링크가 어떤 row 를 집어도 같은 페이지가 나온다. 사람이 읽는 슬러그는
 * 일정 페이지(후속)에서 다룬다.
 *
 * ## 화이트리스트
 * 운영자 확정(2026-08-16): 유럽 대항전 + 5대 리그 + 그 컵대회만. 목록 밖 리그는
 * null → 404. 링크 렌더 쪽도 같은 판정(isMatchPageLeague)을 쓴다.
 */

export interface MatchSummary {
  matchKey: string
  gameId: string
  homeTeam: string
  awayTeam: string
  leagueCode: string
  matchTime: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  homeScore: number | null
  awayScore: number | null
  venue: string | null
}

async function fetchMatchByGameId(gameId: string): Promise<MatchSummary | null> {
  const supabase = createServiceRoleClient()

  const { data: game } = await supabase
    .from("betman_games")
    .select("id, sport, home_team_name, away_team_name, league_code, match_time, venue")
    .eq("id", gameId)
    .maybeSingle()
  if (!game || game.sport !== "축구") return null
  if (!isMatchPageLeague(game.league_code as string)) return null
  // UCL 예선 미확정 대진 — "OO vs 미정" 매치 페이지는 성립하지 않는다 (404)
  if (game.home_team_name === "미정" || game.away_team_name === "미정") return null

  // 형제 row 전체에서 상태·스코어를 접는다 — 스코어는 wisetoto sync 가 어느 row 에
  // 썼는지 보장이 없어(마켓별 다중 row) 값이 있는 row 를 우선한다.
  const { data: siblings } = await supabase
    .from("betman_games")
    .select("status, home_score, away_score")
    .eq("home_team_name", game.home_team_name)
    .eq("away_team_name", game.away_team_name)
    .eq("match_time", game.match_time)

  let status: MatchSummary["status"] = "scheduled"
  let homeScore: number | null = null
  let awayScore: number | null = null
  for (const s of siblings ?? []) {
    const st = s.status as MatchSummary["status"]
    // 우선순위: completed > in_progress > cancelled > scheduled (행마다 갱신 시점이 달라 섞일 수 있다)
    const rank = { completed: 3, in_progress: 2, cancelled: 1, scheduled: 0 } as const
    if ((rank[st] ?? 0) > (rank[status] ?? 0)) status = st
    if (homeScore == null && s.home_score != null) {
      homeScore = Number(s.home_score)
      awayScore = s.away_score != null ? Number(s.away_score) : null
    }
  }

  return {
    matchKey: `${game.home_team_name}_${game.away_team_name}_${game.match_time}`,
    gameId: String(game.id),
    homeTeam: String(game.home_team_name),
    awayTeam: String(game.away_team_name),
    leagueCode: String(game.league_code ?? ""),
    matchTime: String(game.match_time),
    status,
    homeScore,
    awayScore,
    venue: game.venue ? String(game.venue) : null,
  }
}

/** 30초 Data Cache — LIVE 중에도 페이지 새로고침이 스코어를 크게 뒤처지지 않게 짧게 */
export function getMatchByGameId(gameId: string): Promise<MatchSummary | null> {
  return unstable_cache(() => fetchMatchByGameId(gameId), ["match-summary", gameId], {
    revalidate: 30,
  })()
}
