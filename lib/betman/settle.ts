import { SupabaseClient } from "@supabase/supabase-js"
import { batchUpdateUserStats } from "./stats"

interface GameData {
  id: string
  game_no: number
  game_type: string
  sport: string
  result: string
  status: string
  home_win_odds: string
  away_win_odds: string
  draw_odds: string
  over_odds: string
  under_odds: string
  odd_odds: string
  even_odds: string
  daily_round_id: string | null
}

interface PredictionData {
  id: string
  user_id: string
  game_id: string
  prediction: string
  status: string
  stake: number | null
  slip_id: string | null
  locked_odds: number | null
}

export interface SettleResult {
  settled: number
  correct: number
  wrong: number
  cancelled: number
  slipsWon: number
  slipsLost: number
  totalPayout: number
  statsUpdated: number
  errors: string[]
}

/**
 * 개별 예측 정산: is_correct 판정 + points_earned 기록
 */
function getPointsEarned(pred: PredictionData, game: GameData): number {
  if (pred.locked_odds && pred.locked_odds > 0) {
    return pred.locked_odds
  }
  const oddsMap: Record<string, number> = {
    home: parseFloat(game.home_win_odds) || 0,
    away: parseFloat(game.away_win_odds) || 0,
    draw: parseFloat(game.draw_odds) || 0,
    over: parseFloat(game.over_odds) || 0,
    under: parseFloat(game.under_odds) || 0,
    odd: parseFloat(game.odd_odds) || 0,
    even: parseFloat(game.even_odds) || 0,
  }
  return oddsMap[pred.prediction] || 0
}

/**
 * 공통 정산 로직: 예측 정산 → 슬립 정산 → 유저 통계 갱신
 *
 * settle/route.ts와 results/route.ts 양쪽에서 사용
 */
export async function settlePredictions(
  supabase: SupabaseClient,
  games: GameData[],
  predictions: PredictionData[]
): Promise<SettleResult> {
  const result: SettleResult = {
    settled: 0,
    correct: 0,
    wrong: 0,
    cancelled: 0,
    slipsWon: 0,
    slipsLost: 0,
    totalPayout: 0,
    statsUpdated: 0,
    errors: [],
  }

  const gameMap = new Map(games.map((g) => [g.id, g]))

  // 1. 개별 예측 정산
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
        result.errors.push(`pred=${pred.id}: ${error.message}`)
      } else if (updated && updated.length > 0) {
        result.cancelled++
      }
      continue
    }

    const isCorrect = pred.prediction === game.result
    const pointsEarned = isCorrect ? getPointsEarned(pred, game) : 0

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
      result.errors.push(`pred=${pred.id}: ${error.message}`)
    } else if (updated && updated.length > 0) {
      result.settled++
      if (isCorrect) result.correct++
      else result.wrong++
    }
  }

  // 2. 슬립 단위 정산
  const affectedSlipIds = [...new Set(predictions.map((p) => p.slip_id).filter(Boolean))]

  for (const slipId of affectedSlipIds) {
    try {
      const { data: slipPreds } = await supabase
        .from("betman_predictions")
        .select("id, status, is_correct, stake")
        .eq("slip_id", slipId)

      if (!slipPreds) continue
      if (slipPreds.some((p) => p.status === "pending")) continue

      const activePreds = slipPreds.filter((p) => p.status === "settled")

      if (activePreds.length === 0) {
        // 전부 취소 → 슬립도 취소, 환불
        const { data: slipData } = await supabase
          .from("prediction_slips")
          .select("user_id, stake, status")
          .eq("id", slipId)
          .single()

        if (slipData && slipData.status === "pending") {
          const { data: cancelledSlip } = await supabase
            .from("prediction_slips")
            .update({ status: "cancelled" })
            .eq("id", slipId)
            .eq("status", "pending")
            .select("id")

          if (cancelledSlip && cancelledSlip.length > 0) {
            await supabase.rpc("refund_tokens", {
              p_user_id: slipData.user_id,
              p_amount: slipData.stake,
              p_description: "경기 취소 환불 (슬립)",
            })
          }
        }
        continue
      }

      // 이미 정산된 슬립은 건너뜀
      const { data: currentSlip } = await supabase
        .from("prediction_slips")
        .select("status, user_id, stake, total_odds")
        .eq("id", slipId)
        .single()

      if (!currentSlip || currentSlip.status !== "pending") continue

      const allCorrect = activePreds.every((p) => p.is_correct === true)

      if (allCorrect) {
        const payout = Math.round(currentSlip.stake * currentSlip.total_odds * 100) / 100
        result.totalPayout += payout

        const { data: wonSlip } = await supabase
          .from("prediction_slips")
          .update({ status: "won" })
          .eq("id", slipId)
          .eq("status", "pending")
          .select("id")

        if (wonSlip && wonSlip.length > 0) result.slipsWon++
      } else {
        const { data: lostSlip } = await supabase
          .from("prediction_slips")
          .update({ status: "lost" })
          .eq("id", slipId)
          .eq("status", "pending")
          .select("id")

        if (lostSlip && lostSlip.length > 0) result.slipsLost++
      }
    } catch (slipErr) {
      result.errors.push(`slip=${slipId}: ${(slipErr as Error).message}`)
    }
  }

  // 3. 유저별 종목 통계 갱신 (병렬 배치)
  const affectedUserIds = [...new Set(predictions.map((p) => p.user_id))]
  const statsResult = await batchUpdateUserStats(supabase, affectedUserIds, 10)
  result.statsUpdated = statsResult.updated
  result.errors.push(...statsResult.errors)

  return result
}
