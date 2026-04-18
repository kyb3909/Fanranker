import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { settlePredictions } from "@/lib/betman/settle"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/predictions/settle?unsettled_only=true
 *
 * ?온?귐딆쁽 ?類ㅺ텦 ?遺얇늺?癒?퐣 pending ??됰?????λ툡??덈뮉 野껋럡由?筌뤴뫖以?鈺곌퀬?? */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const unsettledOnly = searchParams.get("unsettled_only") === "true"
    const dailyRoundId = searchParams.get("daily_round_id")

    if (unsettledOnly) {
      const { data: pendingPredictions, error: pendingError } = await supabase
        .from("betman_predictions")
        .select("game_id")
        .eq("status", "pending")

      if (pendingError) {
        console.error("[settle GET] pending predictions query error:", pendingError)
        return NextResponse.json({ error: "Failed to fetch pending predictions." }, { status: 500 })
      }

      const pendingGameIds = Array.from(
        new Set(
          (pendingPredictions || [])
            .map((p) => p.game_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      )

      if (pendingGameIds.length === 0) {
        return NextResponse.json({ matches: [], total: 0 })
      }

      const { data: games, error } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, status, result, home_score, away_score, daily_round_id, handicap, over_under_line"
        )
        .in("id", pendingGameIds)
        .lt("match_time", new Date().toISOString())
        .order("match_time", { ascending: false })
        .limit(200)

      if (error) {
        console.error("[settle GET] game query error:", error)
        return NextResponse.json({ error: "Failed to fetch games." }, { status: 500 })
      }

      const pendingCountByGameId = new Map<string, number>()
      for (const p of pendingPredictions || []) {
        if (!p.game_id) continue
        pendingCountByGameId.set(p.game_id, (pendingCountByGameId.get(p.game_id) || 0) + 1)
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
        has_result: !!g.result || g.status === "cancelled",
        handicap: g.handicap,
        over_under_line: g.over_under_line,
        pending_count: pendingCountByGameId.get(g.id) || 0,
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
        return NextResponse.json({ error: "Failed to fetch games." }, { status: 500 })
      }

      return NextResponse.json({ matches: games || [] })
    }

    return apiBadRequest("unsettled_only or daily_round_id is required.")
  } catch (error) {
    return apiError("Server error occurred.", 500, error)
  }
}

/**
 * POST /api/predictions/settle
 *
 * ?온?귐딆쁽 ??롫짗 ?類ㅺ텦: daily_round_id ?癒?뮉 game_ids 疫꿸퀡而? * Body: { daily_round_id?: string, game_ids?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const body = await request.json().catch(() => ({}))
    const { daily_round_id, game_ids } = body as {
      daily_round_id?: string
      game_ids?: string[]
    }

    if (!daily_round_id && (!game_ids || game_ids.length === 0)) {
      return apiBadRequest("daily_round_id or game_ids is required.")
    }

    const gameSelect =
      "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"

    let games
    if (game_ids && game_ids.length > 0) {
      const { data, error } = await supabase
        .from("betman_games")
        .select(gameSelect)
        .in("id", game_ids)
        .in("status", ["completed", "cancelled"])

      if (error) return apiError("Failed to fetch games", 500, error)
      games = (data || []).filter((g) => g.status === "cancelled" || g.result !== null)
    } else if (daily_round_id) {
      const { data, error } = await supabase
        .from("betman_games")
        .select(gameSelect)
        .eq("daily_round_id", daily_round_id)
        .in("status", ["completed", "cancelled"])

      if (error) return apiError("Failed to fetch games", 500, error)
      games = (data || []).filter((g) => g.status === "cancelled" || g.result !== null)
    }

    if (!games || games.length === 0) {
      return NextResponse.json({ error: "No settleable games with results." }, { status: 404 })
    }

    const gameIds = games.map((g) => g.id)
    const { data: predictions, error: predError } = await supabase
      .from("betman_predictions")
      .select("id, user_id, game_id, prediction, status, stake, slip_id, locked_odds")
      .in("game_id", gameIds)
      .eq("status", "pending")

    if (predError) return apiError("Failed to fetch predictions", 500, predError)

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending predictions to settle.",
        settled: 0,
      })
    }

    const result = await settlePredictions(supabase, games, predictions)

    return NextResponse.json({
      success: true,
      ...result,
      message: `${result.settled} settled (correct ${result.correct}, wrong ${result.wrong}, cancelled ${result.cancelled})`,
    })
  } catch (error) {
    return apiError("Server error occurred.", 500, error)
  }
}
