import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { retrySellerReward } from "@/lib/predictions/retry-seller-reward"
import { z } from "zod"

const GOLD_COST = 500
const SELLER_SHARE = 450 // 90% to seller
const PLATFORM_FEE = 50 // 10% platform commission

/**
 * POST /api/predictions/purchase
 *
 * 골드를 사용하여 예측 활동 열람 구매
 * Body: { activity_id: uuid }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const supabase = createServiceRoleClient()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const PurchaseSchema = z.object({ activity_id: z.string().min(1) })
    const parsed = PurchaseSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("activity_id가 필요합니다.")
    const { activity_id } = parsed.data

    // 1. activity 존재 확인
    const { data: activity, error: actError } = await supabase
      .from("prediction_activities")
      .select("id, user_id, round_id, sport")
      .eq("id", activity_id)
      .single()

    if (actError || !activity) {
      return NextResponse.json({ error: "예측 활동을 찾을 수 없습니다." }, { status: 404 })
    }

    // 자기 자신의 예측은 무료
    if (activity.user_id === user.id) {
      return apiBadRequest("자신의 예측은 구매할 필요가 없습니다.")
    }

    // 2. 예측 데이터 조회 (중복구매 체크 및 경기 종료 확인용 + odds/league_code)
    const { data: predictions } = await supabase
      .from("betman_predictions")
      .select(
        `
        id, game_id, prediction, status, slip_id, stake,
        game:betman_games(home_team_name, away_team_name, match_time, game_type, sport, result,
          league_code, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds),
        slip:prediction_slips(id, stake, total_odds, status)
      `
      )
      .eq("user_id", activity.user_id)
      .eq("round_id", activity.round_id)

    // 경기 시간이 모두 지났으면 무료 열람
    const now = new Date()
    const allGamesExpired =
      predictions &&
      predictions.length > 0 &&
      // Supabase join type for betman_games is complex; cast to access match_time
      predictions.every(
        (p) => p.game && new Date((p.game as unknown as { match_time: string }).match_time) < now
      )

    if (allGamesExpired) {
      return NextResponse.json({
        success: true,
        is_free: true,
        predictions: predictions || [],
      })
    }

    // 3. 중복 구매 체크
    const { data: existing } = await supabase
      .from("prediction_purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("activity_id", activity_id)
      .single()

    if (existing) {
      return NextResponse.json({
        success: true,
        already_purchased: true,
        predictions: predictions || [],
      })
    }

    // 4. spend_gold RPC (원자적 500골드 차감)
    const { data: spendResult, error: rpcError } = (await supabase
      .rpc("spend_gold", {
        p_user_id: user.id,
        p_amount: GOLD_COST,
        p_description: `예측 열람 구매 (${activity.sport})`,
      })
      .single()) as {
      data: {
        success: boolean
        remaining?: number
        spent?: number
        error_message?: string
      } | null
      error: unknown
    }

    if (rpcError || !spendResult) {
      return apiError("골드 차감 중 오류가 발생했습니다.", 500, rpcError)
    }

    if (!spendResult.success) {
      return NextResponse.json(
        {
          error: spendResult.error_message || "골드가 부족합니다.",
          gold_balance: spendResult.remaining,
        },
        { status: 400 }
      )
    }

    // 5. prediction_purchases INSERT
    const { data: purchaseRow, error: purchaseError } = await supabase
      .from("prediction_purchases")
      .insert({
        buyer_id: user.id,
        seller_id: activity.user_id,
        activity_id: activity_id,
        gold_spent: GOLD_COST,
      })
      .select("id")
      .single()

    if (purchaseError || !purchaseRow) {
      console.error("Failed to record purchase:", purchaseError)
      // 구매 기록 실패 시 골드 환불 — inline 3회 retry, 모두 실패 시 Sentry fatal
      let refundOk = false
      let lastRefundError: unknown = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error: refundError } = await supabase.rpc("reward_gold", {
          p_user_id: user.id,
          p_amount: GOLD_COST,
          p_description: "구매 기록 실패 환불",
          p_transaction_type: "purchase_refund",
        })
        if (!refundError) {
          refundOk = true
          break
        }
        lastRefundError = refundError
        console.error(`buyer refund attempt ${attempt}/3 failed:`, refundError)
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt))
      }
      if (!refundOk) {
        // 큐에 남긴다 — Sentry 만으로는 어드민이 찾을 수 없는 손실이 된다.
        // 토큰 경로(lib/betman/refund-tokens.ts)는 이미 pending_refunds 에 큐잉하는데
        // 골드 경로만 빠져 있었다. currency='gold' 로 통화를 명시해야
        // 어드민 retry 가 refund_tokens(볼)로 잘못 지급하지 않는다.
        const { error: queueError } = await supabase.from("pending_refunds").insert({
          user_id: user.id,
          amount: GOLD_COST,
          currency: "gold",
          description: `분석글 구매 실패 환불 (activity ${activity_id})`,
          source: "buyer_gold_refund_retry_exhausted",
          attempts: 3,
          last_error: String(lastRefundError),
        })
        if (queueError) {
          console.error("failed to enqueue buyer gold refund:", queueError)
        }
        Sentry.captureMessage(
          `buyer refund failed after 3 retries — user is down ${GOLD_COST} gold`,
          {
            level: "fatal",
            extra: {
              userId: user.id,
              amount: GOLD_COST,
              activityId: activity_id,
              lastRefundError: String(lastRefundError),
              queued: !queueError,
            },
          }
        )
      }
      return NextResponse.json(
        { error: "구매 처리 중 오류가 발생했습니다. 골드가 환불됩니다." },
        { status: 500 }
      )
    }

    // 6. 판매자에게 골드 정산 (90% = 450골드)
    //    inline 3회 retry → 모두 실패 시 pending_seller_rewards에 기록 (admin 수동 처리)
    const settled = await retrySellerReward(supabase, {
      sellerId: activity.user_id,
      buyerId: user.id,
      activityId: activity_id,
      purchaseId: purchaseRow.id,
      amount: SELLER_SHARE,
      description: `분석글 판매 수익 (${activity.sport})`,
    })

    // 7. 판매자에게 알림 전송 — 정산 성공/큐 분기로 톤 조정
    try {
      const { data: buyerProfile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("user_id", user.id)
        .single()

      const buyerName = buyerProfile?.nickname || "누군가"
      const message = settled
        ? `${buyerName}님이 회원님의 분석글을 구매했습니다. (+${SELLER_SHARE}골드)`
        : `${buyerName}님이 회원님의 분석글을 구매했습니다. ${SELLER_SHARE}골드 정산은 잠시 후 반영됩니다.`

      await supabase.from("notifications").insert({
        user_id: activity.user_id,
        type: "analysis_purchased",
        actor_id: user.id,
        message,
      })
    } catch (e) {
      console.error("Failed to send seller notification:", e)
    }

    // 8. 예측 데이터 반환 (이미 위에서 조회함)
    return NextResponse.json({
      success: true,
      already_purchased: false,
      new_balance: spendResult.remaining,
      gold_spent: GOLD_COST,
      seller_received: SELLER_SHARE,
      predictions: predictions || [],
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
