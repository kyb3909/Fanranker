import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isMatchPageLeague } from "@/lib/match/leagues"
import { supplementalSummary, type SupplementalFixture } from "@/lib/match/supplemental-fixtures"
import { getMatchIdentity } from "@/lib/match/sibling-ids"

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
  source?: "lfa"
  lfaMatchId?: string
  betmanGameId?: string | null
  /**
   * LFA 전용 등록 뒤에 베트맨이 연결된 경기의 **베트맨 키** (2026-09-07). 등록 전에 베트맨 키로
   * 만들어진 MoTM 폴을 잃지 않기 위한 보조 조회 키다. 신원은 여전히 `matchKey`(`lfa_…`)다.
   */
  betmanMatchKey?: string
}

async function fetchMatchByGameId(gameId: string): Promise<MatchSummary | null> {
  const supabase = createServiceRoleClient()
  const identity = await getMatchIdentity(supabase, gameId, { strict: true })

  const { data: game, error: gameError } = await supabase
    .from("betman_games")
    .select("id, sport, home_team_name, away_team_name, league_code, match_time, venue")
    .eq("id", gameId)
    .maybeSingle()
  if (gameError) throw new Error(`match-summary-game:${gameError.message}`)
  const { data: registered, error: registeredError } = await supabase
    .from("lfa_fixtures")
    .select("id,lfa_match_id,fixture,match_time,betman_game_id")
    .in("id", identity.gameIds)
  if (registeredError) throw new Error(`match-summary-lfa:${registeredError.message}`)
  if ((registered?.length ?? 0) > 1) throw new Error("match-summary-lfa-conflict")
  const supplemental = registered?.[0] as SupplementalFixture | undefined
  if (supplemental) {
    if (!isMatchPageLeague(supplemental.fixture.leagueCode)) return null
    return {
      ...supplementalSummary(supplemental),
      // Compatibility only: both URL sources derive aliases from the same identity.
      betmanMatchKey: identity.pollKeys.find((key) => !key.startsWith("lfa_")),
    }
  }
  if (!game) return null
  if (game.sport !== "축구") return null
  if (!isMatchPageLeague(game.league_code as string)) return null
  // UCL 예선 미확정 대진 — "OO vs 미정" 매치 페이지는 성립하지 않는다 (404)
  if (game.home_team_name === "미정" || game.away_team_name === "미정") return null

  // 형제 row 전체에서 상태·스코어를 접는다 — 결과 크롤이 어느 row 에 썼는지 보장이
  // 없어(마켓별 다중 row) 값이 있는 row 를 우선한다. (2026-09-02: 쓰는 쪽은 VPS betman
  // 결과 크롤이다 — 종전 주석의 wisetoto sync 는 걷어냈다)
  const { data: siblings, error: siblingsError } = await supabase
    .from("betman_games")
    .select("id, status, home_score, away_score")
    .in("id", identity.gameIds)
  if (siblingsError) throw new Error(`match-summary-siblings:${siblingsError.message}`)

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
