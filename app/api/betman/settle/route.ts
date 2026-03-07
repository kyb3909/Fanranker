import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { settlePredictions } from "@/lib/betman/settle"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const settlePostSchema = z
  .object({
    round_id: z.string().optional(),
    gm_ts: z.union([z.string(), z.number()]).transform(String).optional(),
    daily_round_id: z.string().optional(),
    daily_id: z.string().optional(),
  })
  .refine((data) => data.round_id || data.gm_ts || data.daily_round_id || data.daily_id, {
    message: "daily_round_id, daily_id, round_id, or gm_ts is required.",
  })

/**
 * POST /api/betman/settle
 *
 * ?꾨즺??寃쎄린???덉륫???뺤궛?쒕떎.
 * - ?덉륫 vs ?ㅼ젣 寃곌낵 鍮꾧탳 ??is_correct ?먯젙
 * - ?곸쨷 ??points_earned = ?대떦 諛곕떦瑜?(locked_odds ?곗꽑)
 * - 誘몄쟻以???points_earned = 0
 * - 痍⑥냼 寃쎄린 ?덉륫 ??status='cancelled', is_correct=null
 * - ?뺤궛 ???좎?蹂?醫낅ぉ ?듦퀎 ?먮룞 媛깆떊
 *
 * Body: { round_id?: string, gm_ts?: string, daily_round_id?: string, daily_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("Invalid request body.")
    }
    const parsed = settlePostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(
        parsed.error.errors[0]?.message ||
          "daily_round_id, daily_id, round_id, or gm_ts is required."
      )
    }
    const supabase = createServiceRoleClient()

    // --- Determine which games to settle ---
    let gameFilter: { column: string; value: string } | null = null

    if (parsed.data.daily_round_id) {
      gameFilter = { column: "daily_round_id", value: parsed.data.daily_round_id }
    } else if (parsed.data.daily_id) {
      const { data: dr } = await supabase
        .from("betman_daily_rounds")
        .select("id")
        .eq("daily_id", parsed.data.daily_id)
        .single()
      if (dr) {
        gameFilter = { column: "daily_round_id", value: dr.id }
      }
    } else if (parsed.data.round_id) {
      gameFilter = { column: "round_id", value: parsed.data.round_id }
    } else if (parsed.data.gm_ts) {
      const { data: round } = await supabase
        .from("betman_rounds")
        .select("id")
        .eq("gm_ts", parsed.data.gm_ts)
        .single()
      if (round) {
        gameFilter = { column: "round_id", value: round.id }
      }
    }

    if (!gameFilter) {
      return apiBadRequest("daily_round_id, daily_id, round_id, or gm_ts is required.")
    }

    // 0. 吏??scheduled 寃뚯엫 ?먮룞 留뚮즺
    const { error: expireError } = await supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq(gameFilter.column, gameFilter.value)
      .eq("status", "scheduled")
      .lt("match_time", new Date().toISOString())
    if (expireError) console.error("Failed to expire scheduled games:", expireError)

    // 1. ?꾨즺/痍⑥냼??寃쎄린 議고쉶
    const { data: games, error: gamesError } = await supabase
      .from("betman_games")
      .select(
        "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
      )
      .eq(gameFilter.column, gameFilter.value)
      .in("status", ["completed", "cancelled"])

    if (gamesError) {
      return NextResponse.json({ error: "Failed to fetch games" }, { status: 500 })
    }

    const settleableGames = (games || []).filter(
      (g) => g.status === "cancelled" || (!!g.result && g.result !== "")
    )

    if (settleableGames.length === 0) {
      return NextResponse.json({ error: "No settleable finished games found." }, { status: 404 })
    }

    // 2. pending predictions
    const gameIds = settleableGames.map((g) => g.id)
    const { data: predictions, error: predError } = await supabase
      .from("betman_predictions")
      .select("id, user_id, game_id, prediction, status, stake, slip_id, locked_odds")
      .in("game_id", gameIds)
      .eq("status", "pending")

    if (predError) {
      return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 })
    }

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        message: "No pending predictions to settle.",
        settled: 0,
        correct: 0,
        wrong: 0,
        cancelled: 0,
      })
    }

    // 3. 怨듯넻 ?뺤궛 濡쒖쭅 ?ㅽ뻾
    const settleResult = await settlePredictions(supabase, settleableGames, predictions)

    // 4. daily round ?곹깭 ?낅뜲?댄듃
    const dailyRoundIds = [...new Set(settleableGames.map((g) => g.daily_round_id).filter(Boolean))]
    for (const drId of dailyRoundIds) {
      const { data: remainingGames } = await supabase
        .from("betman_games")
        .select("id")
        .eq("daily_round_id", drId)
        .in("status", ["scheduled", "in_progress"])
        .limit(1)

      const allDone = !remainingGames || remainingGames.length === 0
      if (allDone) {
        await supabase
          .from("betman_daily_rounds")
          .update({ status: "settled", updated_at: new Date().toISOString() })
          .eq("id", drId)
          .lt("bet_close_at", new Date().toISOString())
      }
    }

    // 4b. proto round ?곹깭 (backward compat)
    if (gameFilter.column === "round_id") {
      const { data: remainingGames } = await supabase
        .from("betman_games")
        .select("id")
        .eq("round_id", gameFilter.value)
        .in("status", ["scheduled", "in_progress"])
        .limit(1)

      const allDone = !remainingGames || remainingGames.length === 0
      if (allDone) {
        await supabase
          .from("betman_rounds")
          .update({ status: "settled", updated_at: new Date().toISOString() })
          .eq("id", gameFilter.value)
      }
    }

    const affectedSlipIds = [...new Set(predictions.map((p) => p.slip_id).filter(Boolean))]

    return NextResponse.json({
      filter: gameFilter,
      dailyRoundsUpdated: dailyRoundIds.length,
      settled: settleResult.settled,
      correct: settleResult.correct,
      wrong: settleResult.wrong,
      cancelled: settleResult.cancelled,
      totalPredictions: predictions.length,
      slips: {
        total: affectedSlipIds.length,
        won: settleResult.slipsWon,
        lost: settleResult.slipsLost,
        totalPayout: settleResult.totalPayout,
      },
      statsUpdated: settleResult.statsUpdated,
      errors: settleResult.errors.length > 0 ? settleResult.errors : undefined,
    })
  } catch (e) {
    return apiError("Server error occurred.", 500, e)
  }
}
