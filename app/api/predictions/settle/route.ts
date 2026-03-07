import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isAdmin } from "@/lib/supabase/admin"
import { settlePredictions } from "@/lib/betman/settle"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/predictions/settle?unsettled_only=true
 *
 * betman_games 기반 미정산 경기 목록 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await isAdmin()
    if (!admin) {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const unsettledOnly = searchParams.get("unsettled_only") === "true"
    const dailyRoundId = searchParams.get("daily_round_id")

    if (unsettledOnly) {
      const { data: games, error } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, status, result, home_score, away_score, daily_round_id"
        )
        .lt("match_time", new Date().toISOString())
        .is("result", null)
        .order("match_time", { ascending: false })
        .limit(200)

      if (error) {
        console.error("[settle GET] query error:", error)
        return NextResponse.json({ error: "경기 조회 중 오류가 발생했습니다." }, { status: 500 })
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
        daily_round_id: g.daily_round_id,
        has_result: !!g.result,
      }))

      return NextResponse.json({ matches, total: matches.length })
    }

    if (dailyRoundId) {
      const { data: games, error } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, status, result, home_score, away_score"
        )
        .eq("daily_round_id", dailyRoundId)
        .order("game_no")

      if (error) {
        return NextResponse.json({ error: "경기 조회 중 오류가 발생했습니다." }, { status: 500 })
      }

      return NextResponse.json({ matches: games || [] })
    }

    return apiBadRequest("unsettled_only 또는 daily_round_id 파라미터가 필요합니다.")
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * POST /api/predictions/settle
 *
 * 관리자 수동 정산: daily_round_id 또는 game_ids 기반
 * Body: { daily_round_id?: string, game_ids?: string[] }
 *
 * 공통 settlePredictions 함수를 활용하여 기존 betman/settle 경로와 동일한 로직 적용
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const admin = await isAdmin()
    if (!admin) {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const supabase = createServiceRoleClient()
    const body = await request.json().catch(() => ({}))
    const { daily_round_id, game_ids } = body as {
      daily_round_id?: string
      game_ids?: string[]
    }

    if (!daily_round_id && (!game_ids || game_ids.length === 0)) {
      return apiBadRequest("daily_round_id 또는 game_ids가 필요합니다.")
    }

    let games
    if (game_ids && game_ids.length > 0) {
      const { data, error } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
        )
        .in("id", game_ids)
        .not("result", "is", null)

      if (error) return apiError("경기 조회 실패", 500, error)
      games = data
    } else if (daily_round_id) {
      const { data, error } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
        )
        .eq("daily_round_id", daily_round_id)
        .not("result", "is", null)

      if (error) return apiError("경기 조회 실패", 500, error)
      games = data
    }

    if (!games || games.length === 0) {
      return NextResponse.json(
        { error: "결과가 입력된 정산 가능 경기가 없습니다. 먼저 경기 결과를 입력해주세요." },
        { status: 404 }
      )
    }

    const gameIds = games.map((g) => g.id)
    const { data: predictions, error: predError } = await supabase
      .from("betman_predictions")
      .select("id, user_id, game_id, prediction, status, stake, slip_id, locked_odds")
      .in("game_id", gameIds)
      .eq("status", "pending")

    if (predError) return apiError("예측 조회 실패", 500, predError)

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "정산할 pending 예측이 없습니다.",
        settled: 0,
      })
    }

    const result = await settlePredictions(supabase, games, predictions)

    return NextResponse.json({
      success: true,
      ...result,
      message: `${result.settled}건 정산 완료 (적중 ${result.correct}, 미적중 ${result.wrong}, 취소 ${result.cancelled})`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
