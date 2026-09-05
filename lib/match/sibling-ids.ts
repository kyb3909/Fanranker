import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getSupplementalFixture,
  findSupplementalForBetmanIds,
} from "@/lib/match/supplemental-fixtures"

/**
 * 이 경기의 형제 game_id 전부 (2026-09-02).
 *
 * betman 은 같은 경기를 마켓별 다중 행(평균 4.8행)으로 갖는다. 라인업·상세 캐시는 "요청받은
 * game_id 에 저장하고 그 id 로만 읽는" 구조라, 매치센터(유저가 어느 행 링크로 들어왔든)·
 * MoTM·리포트·사가 리뷰·lfa-warm 이 서로 다른 형제 id 로 부르면 그때마다 복사본이 하나 더
 * 생기고 바깥(LFA·soccerway)에도 한 번 더 물었다. 7일 실측: 화이트리스트 52경기 중 40경기가
 * 2~6행. 읽을 때 형제 행까지 보면 복사본도 중복 fetch 도 준다.
 *
 * 같은 조회가 match-extras.ts(matchSiblingIds)·lineup-lookup.ts(② 형제 row 확장)에 인라인으로
 * 있다 — 새로 쓰는 곳은 이걸 쓴다. 기존 두 곳은 손대지 않는다(지금 잘 돈다).
 *
 * 행을 못 찾으면 자기 자신만 돌려준다 — 종전 동작으로 접힌다 (fail-open).
 */
export async function getSiblingGameIds(
  supabase: SupabaseClient,
  gameId: string,
  opts: { strict?: boolean } = {}
): Promise<string[]> {
  try {
    const { data: game, error: gameError } = await supabase
      .from("betman_games")
      .select("home_team_name, away_team_name, match_time, league_code")
      .eq("id", gameId)
      .maybeSingle()
    if (!gameError && !game?.match_time) {
      const supplemental = await getSupplementalFixture(gameId)
      if (supplemental) {
        if (!supplemental.betman_game_id) return [gameId]
        const linked = await getSiblingGameIds(supabase, supplemental.betman_game_id, opts)
        return [...new Set([gameId, ...linked])]
      }
    }
    if (gameError || !game?.match_time) {
      if (opts.strict) throw new Error("sibling-game-lookup-failed")
      return [gameId]
    }
    const { data: siblings, error: siblingError } = await supabase
      .from("betman_games")
      .select("id")
      .eq("league_code", game.league_code)
      .eq("home_team_name", game.home_team_name)
      .eq("away_team_name", game.away_team_name)
      .eq("match_time", game.match_time)
    const ids = (siblings ?? []).map((s) => String(s.id))
    if (opts.strict && (siblingError || !ids.includes(gameId))) {
      throw new Error("sibling-list-lookup-failed")
    }
    const supplemental = await findSupplementalForBetmanIds(ids).catch((error) => {
      if (opts.strict) throw error
      return null
    })
    if (supplemental) return [...new Set([supplemental.id, ...ids])]
    return ids.length > 0 ? ids : [gameId]
  } catch (error) {
    if (opts.strict) throw error
    return [gameId]
  }
}
