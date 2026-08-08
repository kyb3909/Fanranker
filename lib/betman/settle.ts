import { SupabaseClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { batchUpdateUserStats } from "./stats"
import { retryRefundTokens } from "./refund-tokens"
import { syncStadiumContributions } from "@/lib/stadium/contribution-sync"

/**
 * settlement_audit_log INSERT 페이로드.
 * 슬립 단위 정산 + 환불 이벤트만 기록 (예측 단위 생략 — 부하 최소화).
 * 자세한 설계: docs/PRD-betting-integrity.md
 */
interface AuditRow {
  event_type: "settle_slip" | "refund" | "cancel" | "manual_reverse"
  actor: string
  game_id: string | null
  slip_id: string | null
  prediction_id: string | null
  user_id: string | null
  before_state: Record<string, unknown>
  after_state: Record<string, unknown>
  amount: number | null
  reason: string
  rpc_name: string
}

/**
 * 환불 재시도 (3회) + 실패 시 pending_refunds 기록 — 엔진은 retryRefundTokens
 * 단일 소스 (2026-08-08 감사 P2-3: 동일 패턴 복제 통합). 성공 시 audit 행 push.
 */
async function retryRefund(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  description: string,
  slipId: string | null,
  auditRows: AuditRow[],
  actor: string
): Promise<string | null> {
  return retryRefundTokens(supabase, userId, amount, description, 3, {
    source: "settlement_refund_failed",
    onSuccess: (attempt) => {
      auditRows.push({
        event_type: "refund",
        actor,
        game_id: null,
        slip_id: slipId,
        prediction_id: null,
        user_id: userId,
        before_state: { reason: "pre-refund" },
        after_state: { refund_applied: true, attempt },
        amount, // 양수 — 토큰 지급
        reason: description,
        rpc_name: "refund_tokens",
      })
    },
  })
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

interface SettleResult {
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
 * settle/route.ts와 results/route.ts 양쪽에서 사용.
 *
 * audit 정책 (PRD Phase 1):
 *   - 슬립 단위 정산 (won/lost/cancelled) 이벤트만 audit log 에 기록
 *   - 예측 단위는 부하 최소화 위해 생략
 *   - 환불 성공 시 별도 audit row
 *   - Batch INSERT 1회 (round-trip 최소화)
 */
export async function settlePredictions(
  supabase: SupabaseClient,
  games: GameData[],
  predictions: PredictionData[],
  options: { actor?: string } = {}
): Promise<SettleResult> {
  const actor = options.actor ?? "cron:settle"
  const auditRows: AuditRow[] = []
  // 슬립 확정(won/lost) 시 유저에게 인앱 알림 — 스키마/UI(settlement_result)는
  // migration 039 부터 존재했으나 발송이 미배선이었음 (2026-07-02 배선).
  // metadata 는 notification-dropdown.tsx 가 읽는 is_correct / points_earned 형태.
  const notificationRows: Array<{
    user_id: string
    type: "settlement_result"
    actor_id: string
    metadata: Record<string, unknown>
  }> = []

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

    // Guardrail: skip non-cancelled games that still do not have a final result.
    if (game.status !== "cancelled" && (!game.result || game.result === "")) {
      continue
    }

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
            // audit: 슬립 취소 (refund 는 retryRefund 안에서 별도 audit)
            auditRows.push({
              event_type: "settle_slip",
              actor,
              game_id: null,
              slip_id: slipId,
              prediction_id: null,
              user_id: slipData.user_id,
              before_state: { status: "pending", stake: slipData.stake },
              after_state: { status: "cancelled", stake: slipData.stake },
              amount: null,
              reason: "all predictions cancelled → slip cancelled",
              rpc_name: "settlePredictions",
            })

            const refundErr = await retryRefund(
              supabase,
              slipData.user_id,
              slipData.stake,
              `경기 취소 환불 (슬립 ${slipId})`,
              slipId,
              auditRows,
              actor
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

        if (wonSlip && wonSlip.length > 0) {
          result.slipsWon++
          notificationRows.push({
            user_id: currentSlip.user_id,
            type: "settlement_result",
            actor_id: currentSlip.user_id, // 시스템 알림 — actor NOT NULL 이라 본인으로
            metadata: {
              is_correct: true,
              points_earned: payout,
              settlement_status: "won",
              slip_id: slipId,
            },
          })
          auditRows.push({
            event_type: "settle_slip",
            actor,
            game_id: null,
            slip_id: slipId,
            prediction_id: null,
            user_id: currentSlip.user_id,
            before_state: {
              status: "pending",
              stake: currentSlip.stake,
              total_odds: currentSlip.total_odds,
            },
            after_state: {
              status: "won",
              stake: currentSlip.stake,
              total_odds: adjustedTotalOdds,
              payout, // 계산된 payout (실제 토큰 지급은 없음 — "점수만" 모델)
            },
            amount: null, // 토큰 변동 없음
            reason: `all correct (predictions=${activePreds.length}, cancelled=${cancelledPreds.length})`,
            rpc_name: "settlePredictions",
          })
        }
      } else {
        const { data: lostSlip } = await supabase
          .from("prediction_slips")
          .update({ status: "lost" })
          .eq("id", slipId)
          .eq("status", "pending")
          .select("id")

        if (lostSlip && lostSlip.length > 0) {
          result.slipsLost++
          notificationRows.push({
            user_id: currentSlip.user_id,
            type: "settlement_result",
            actor_id: currentSlip.user_id,
            metadata: {
              is_correct: false,
              points_earned: 0,
              settlement_status: "lost",
              slip_id: slipId,
            },
          })
          auditRows.push({
            event_type: "settle_slip",
            actor,
            game_id: null,
            slip_id: slipId,
            prediction_id: null,
            user_id: currentSlip.user_id,
            before_state: {
              status: "pending",
              stake: currentSlip.stake,
              total_odds: currentSlip.total_odds,
            },
            after_state: {
              status: "lost",
              stake: currentSlip.stake,
              total_odds: adjustedTotalOdds,
            },
            amount: null,
            reason: `some wrong (predictions=${activePreds.length}, cancelled=${cancelledPreds.length})`,
            rpc_name: "settlePredictions",
          })
        }
      }
    } catch (slipErr) {
      result.errors.push(`slip=${slipId}: ${(slipErr as Error).message}`)
    }
  }

  // 2.4 정산 결과 인앱 알림 batch INSERT — 실패해도 정산에는 영향 없음
  if (notificationRows.length > 0) {
    const { error: notifErr } = await supabase.from("notifications").insert(notificationRows)
    if (notifErr) {
      Sentry.captureException(notifErr, {
        extra: { context: "settlement_notification_insert", rowCount: notificationRows.length },
      })
      result.errors.push(`notification insert failed: ${notifErr.message}`)
    }
  }

  // 2.5 정산 audit log batch INSERT
  // 정산 자체는 이미 끝났음. audit 실패해도 정산은 그대로 — 단 Sentry 알럿.
  if (auditRows.length > 0) {
    const { error: auditErr } = await supabase.from("settlement_audit_log").insert(auditRows)
    if (auditErr) {
      Sentry.captureException(auditErr, {
        level: "fatal",
        extra: { context: "settlement_audit_batch_insert", rowCount: auditRows.length },
      })
      result.errors.push(`audit_log insert failed: ${auditErr.message}`)
    }
  }

  // 3. 유저별 종목 통계 갱신 (병렬 배치)
  const affectedUserIds = [...new Set(predictions.map((p) => p.user_id))]
  const statsResult = await batchUpdateUserStats(supabase, affectedUserIds, 10)
  result.statsUpdated = statsResult.updated
  result.errors.push(...statsResult.errors)

  // 4. 경기장 기여 동기화 (stats 갱신 후 실행, 실패해도 정산 결과에 영향 없음)
  try {
    await syncStadiumContributions(supabase, affectedUserIds)
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "stadium_contribution_sync" } })
  }

  return result
}
