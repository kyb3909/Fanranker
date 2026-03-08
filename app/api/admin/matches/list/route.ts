import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/supabase/admin"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/matches/list
 *
 * betman_games 기반 경기 목록 + 예측 수 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "all"
    const sport = searchParams.get("sport") || "all"
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = 50
    const offset = (page - 1) * limit

    let query = supabase
      .from("betman_games")
      .select(
        "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, status, result, home_score, away_score, handicap, over_under_line, round_id",
        { count: "exact" }
      )
      .order("match_time", { ascending: false })
      .range(offset, offset + limit - 1)

    if (status !== "all") {
      if (status === "unsettled") {
        query = query.lt("match_time", new Date().toISOString()).is("result", null)
      } else {
        query = query.eq("status", status)
      }
    }

    if (sport !== "all") {
      query = query.ilike("sport", `%${sport}%`)
    }

    const { data: games, count, error } = await query

    if (error) {
      return apiError("경기 목록을 가져오는 중 오류가 발생했습니다.", 500, error)
    }

    const gameIds = (games || []).map((g) => g.id)
    let predCountMap = new Map<string, number>()

    if (gameIds.length > 0) {
      const { data: predCounts } = await supabase
        .from("betman_predictions")
        .select("game_id")
        .in("game_id", gameIds)

      if (predCounts) {
        for (const p of predCounts) {
          predCountMap.set(p.game_id, (predCountMap.get(p.game_id) || 0) + 1)
        }
      }
    }

    const matches = (games || []).map((g) => ({
      id: g.id,
      game_no: g.game_no,
      sport: g.sport,
      game_type: g.game_type,
      home_team: g.home_team_name,
      away_team: g.away_team_name,
      match_time: g.match_time,
      status: g.status,
      result: g.result,
      home_score: g.home_score,
      away_score: g.away_score,
      handicap: g.handicap,
      over_under_line: g.over_under_line,
      prediction_count: predCountMap.get(g.id) || 0,
    }))

    return NextResponse.json({ matches, total: count ?? 0, page, limit })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
