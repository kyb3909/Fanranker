import { SupabaseClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { batchUpdateUserStats } from "./stats"

/**
 * 환불 재시도 (3회) + 실패 시 pending_refunds 기록
 */
async function retryRefund(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  description: string
): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.rpc("refund_tokens", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    })
    if (!error) return null
    if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt))
  }
  // 모든 재시도 실패 → pending_refunds에 기록
  await supabase.from("pending_refunds").insert({
    user_id: userId,
    amount,
    description,
    source: "settlement_refund_failed",
    attempts: 3,
    last_error: "All retry attempts failed",
  })
  Sentry.captureMessage("settlement refund failed after 3 retries", {
    level: "fatal",
    extra: { userId, amount, description },
  })
  return `refund failed for user=${userId} amount=${amount}`
}

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
        .select("id, status, is_correct, locked_odds")
        .eq("slip_id", slipId)

      if (!slipPreds) continue
      if (slipPreds.some((p) => p.status === "pending")) continue

      const activePreds = slipPreds.filter((p) => p.status === "settled")
      const cancelledPreds = slipPreds.filter((p) => p.status === "cancelled")

      if (activePreds.length === 0) {
        // 전부 취소 → 슬립도 취소, 전액 환불
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
            const refundErr = await retryRefund(
              supabase,
              slipData.user_id,
              slipData.stake,
              `경기 취소 환불 (슬립 ${slipId})`
            )
            if (refundErr) result.errors.push(refundErr)
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

      // 부분 취소 시: 취소된 경기의 배당률을 제외하고 total_odds 재계산
      let adjustedTotalOdds = currentSlip.total_odds
      if (cancelledPreds.length > 0 && activePreds.length > 0) {
        adjustedTotalOdds = activePreds.reduce((acc, p) => {
          const odds = p.locked_odds && p.locked_odds > 0 ? p.locked_odds : 1
          return acc * odds
        }, 1)
        adjustedTotalOdds = Math.round(adjustedTotalOdds * 100) / 100

        // 슬립의 total_odds도 업데이트
        await supabase
          .from("prediction_slips")
          .update({ total_odds: adjustedTotalOdds })
          .eq("id", slipId)
      }

      const allCorrect = activePreds.every((p) => p.is_correct === true)

      if (allCorrect) {
        const payout = Math.round(currentSlip.stake * adjustedTotalOdds * 100) / 100
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
