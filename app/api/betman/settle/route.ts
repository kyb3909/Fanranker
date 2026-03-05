import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { updateUserSportStats } from "@/lib/betman/stats"
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
    message: "daily_round_id, daily_id, round_id, 또는 gm_ts가 필요합니다.",
  })

/**
 * POST /api/betman/settle
 *
 * 완료된 경기의 예측을 정산한다.
 * - 예측 vs 실제 결과 비교 → is_correct 판정
 * - 적중 시 points_earned = 해당 배당률
 * - 미적중 시 points_earned = 0
 * - 취소 경기 예측 → status='cancelled', is_correct=null
 * - 정산 후 유저별 종목 통계 자동 갱신
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
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = settlePostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(
        parsed.error.errors[0]?.message ||
          "daily_round_id, daily_id, round_id, 또는 gm_ts가 필요합니다."
      )
    }
    const supabase = createServiceRoleClient()

    // --- Determine which games to settle ---
    let gameFilter: { column: string; value: string } | null = null

    if (parsed.data.daily_round_id) {
      gameFilter = { column: "daily_round_id", value: parsed.data.daily_round_id }
    } else if (parsed.data.daily_id) {
      // Look up daily_round_id from daily_id
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
      return apiBadRequest("daily_round_id, daily_id, round_id, 또는 gm_ts가 필요합니다.")
    }

    // 0. 해당 필터의 지난 scheduled 게임 자동 만료 (결과 없이 시간 지난 게임)
    const { error: expireError } = await supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq(gameFilter.column, gameFilter.value)
      .eq("status", "scheduled")
      .lt("match_time", new Date().toISOString())
    if (expireError) console.error("Failed to expire scheduled games:", expireError)

    // 1. 해당 필터의 완료/취소된 경기 조회
    const { data: games, error: gamesError } = await supabase
      .from("betman_games")
      .select(
        "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, daily_round_id"
      )
      .eq(gameFilter.column, gameFilter.value)
      .in("status", ["completed", "cancelled"])

    if (gamesError) {
      return NextResponse.json({ error: "경기 조회 실패" }, { status: 500 })
    }

    if (!games || games.length === 0) {
      return NextResponse.json({ error: "정산 가능한 완료된 경기가 없습니다." }, { status: 404 })
    }

    const gameMap = new Map(games.map((g) => [g.id, g]))

    // 2. 해당 경기들에 대한 pending 예측 조회
    const gameIds = games.map((g) => g.id)
    const { data: predictions, error: predError } = await supabase
      .from("betman_predictions")
      .select("id, user_id, game_id, prediction, status, stake, slip_id")
      .in("game_id", gameIds)
      .eq("status", "pending")

    if (predError) {
      return NextResponse.json({ error: "예측 조회 실패" }, { status: 500 })
    }

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        message: "정산할 pending 예측이 없습니다.",
        settled: 0,
        correct: 0,
        wrong: 0,
        cancelled: 0,
      })
    }

    // 3. 정산 처리
    let settled = 0
    let correct = 0
    let wrong = 0
    let cancelled = 0
    const errors: string[] = []

    for (const pred of predictions) {
      const game = gameMap.get(pred.game_id)
      if (!game) continue

      if (game.status === "cancelled") {
        const { data: updated, error } = await supabase
          .from("betman_predictions")
          .update({
            status: "cancelled",
            is_correct: null,
            points_earned: 0,
            settled_at: new Date().toISOString(),
          })
          .eq("id", pred.id)
          .eq("status", "pending")
          .select("id")

        if (error) {
          errors.push(`pred=${pred.id}: ${error.message}`)
        } else if (updated && updated.length > 0) {
          cancelled++
        }
        continue
      }

      const isCorrect = pred.prediction === game.result
      const predStake = pred.stake ?? 1

      let pointsEarned = 0
      if (isCorrect) {
        const oddsMap: Record<string, number> = {
          home: parseFloat(game.home_win_odds) || 0,
          away: parseFloat(game.away_win_odds) || 0,
          draw: parseFloat(game.draw_odds) || 0,
          over: parseFloat(game.over_odds) || 0,
          under: parseFloat(game.under_odds) || 0,
        }
        pointsEarned = oddsMap[pred.prediction] || 0
      }

      const { data: updated, error } = await supabase
        .from("betman_predictions")
        .update({
          status: "settled",
          is_correct: isCorrect,
          points_earned: pointsEarned,
          settled_at: new Date().toISOString(),
        })
        .eq("id", pred.id)
        .eq("status", "pending")
        .select("id")

      if (error) {
        errors.push(`pred=${pred.id}: ${error.message}`)
      } else if (updated && updated.length > 0) {
        settled++
        if (isCorrect) correct++
        else wrong++
      }
    }

    // 3b. 슬립 단위 정산 (모든 예측 정산 후)
    // 슬립의 모든 예측이 settled/cancelled → 슬립 상태 결정
    const affectedSlipIds = [...new Set(predictions.map((p) => p.slip_id).filter(Boolean))]
    let slipsWon = 0
    let slipsLost = 0
    let totalPayout = 0

    for (const slipId of affectedSlipIds) {
      // 슬립의 모든 예측 조회
      const { data: slipPreds } = await supabase
        .from("betman_predictions")
        .select("id, status, is_correct, stake")
        .eq("slip_id", slipId)

      if (!slipPreds) continue

      // 아직 pending인 예측이 있으면 건너뜀
      const hasPending = slipPreds.some((p) => p.status === "pending")
      if (hasPending) continue

      // 취소 제외한 예측들
      const activePreds = slipPreds.filter((p) => p.status === "settled")
      if (activePreds.length === 0) {
        // 전부 취소 → 슬립도 취소, 환불
        const { data: slipData } = await supabase
          .from("prediction_slips")
          .select("user_id, stake")
          .eq("id", slipId)
          .single()

        const { data: cancelledSlip } = await supabase
          .from("prediction_slips")
          .update({ status: "cancelled" })
          .eq("id", slipId)
          .eq("status", "pending")
          .select("id")

        if (cancelledSlip && cancelledSlip.length > 0 && slipData) {
          await supabase.rpc("refund_tokens", {
            p_user_id: slipData.user_id,
            p_amount: slipData.stake,
            p_description: `경기 취소 환불 (슬립)`,
          })
        }
        continue
      }

      // 모든 활성 예측 적중 여부
      const allCorrect = activePreds.every((p) => p.is_correct === true)

      if (allCorrect) {
        // 적중! → 슬립의 total_odds * stake 지급
        const { data: slipData } = await supabase
          .from("prediction_slips")
          .select("user_id, stake, total_odds")
          .eq("id", slipId)
          .single()

        if (slipData) {
          const payout = Math.round(slipData.stake * slipData.total_odds * 100) / 100
          totalPayout += payout
          // 볼은 소모성 — 적중해도 볼을 돌려받지 않음
          // 포인트(points_earned)만 betman_predictions에 기록됨
        }

        const { data: wonSlip } = await supabase
          .from("prediction_slips")
          .update({ status: "won" })
          .eq("id", slipId)
          .eq("status", "pending")
          .select("id")
        if (wonSlip && wonSlip.length > 0) slipsWon++
      } else {
        const { data: lostSlip } = await supabase
          .from("prediction_slips")
          .update({ status: "lost" })
          .eq("id", slipId)
          .eq("status", "pending")
          .select("id")
        if (lostSlip && lostSlip.length > 0) slipsLost++
      }
    }

    // 4. Update daily round status if settling by daily_round_id
    //    - All games completed/cancelled → "settled"
    //    - Otherwise → do NOT touch (round stays "open" until natural bet_close_at)
    //    "closed" is only set by games API at bet_close_at (23:00 KST), never by settle.
    const dailyRoundIds = [...new Set(games.map((g) => g.daily_round_id).filter(Boolean))]
    for (const drId of dailyRoundIds) {
      const { data: remainingGames } = await supabase
        .from("betman_games")
        .select("id")
        .eq("daily_round_id", drId)
        .in("status", ["scheduled", "in_progress"])
        .limit(1)

      const allDone = !remainingGames || remainingGames.length === 0
      if (allDone) {
        // bet_close_at이 지난 라운드만 settled로 전환 (베팅 보호)
        await supabase
          .from("betman_daily_rounds")
          .update({ status: "settled", updated_at: new Date().toISOString() })
          .eq("id", drId)
          .lt("bet_close_at", new Date().toISOString())
      }
      // bet_close_at 전이면 상태 변경하지 않음 — 베팅은 항상 가능
    }

    // 4b. Also update proto round status (backward compat)
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

    // 5. 유저별 종목 통계 갱신
    const affectedUserIds = [...new Set(predictions.map((p) => p.user_id))]
    const statsErrors: string[] = []

    for (const userId of affectedUserIds) {
      try {
        await updateUserSportStats(supabase, userId)
      } catch (e) {
        statsErrors.push(`stats user=${userId}: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({
      filter: gameFilter,
      dailyRoundsUpdated: dailyRoundIds.length,
      settled,
      correct,
      wrong,
      cancelled,
      totalPredictions: predictions.length,
      slips: { total: affectedSlipIds.length, won: slipsWon, lost: slipsLost, totalPayout },
      statsUpdated: affectedUserIds.length,
      errors: [...errors, ...statsErrors].length > 0 ? [...errors, ...statsErrors] : undefined,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
