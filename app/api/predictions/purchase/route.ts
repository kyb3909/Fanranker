import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const GOLD_COST = 500

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

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()
    const body = await request.json()
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

    // 2. 예측 데이터 조회 (중복구매 체크 및 경기 종료 확인용)
    const { data: predictions } = await supabase
      .from("betman_predictions")
      .select(
        `
        id, game_id, prediction, status,
        game:betman_games(home_team_name, away_team_name, match_time, game_type, sport, result)
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
        new_balance?: number
        current_balance?: number
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
          gold_balance: spendResult.current_balance,
        },
        { status: 400 }
      )
    }

    // 5. prediction_purchases INSERT
    const { error: purchaseError } = await supabase.from("prediction_purchases").insert({
      buyer_id: user.id,
      seller_id: activity.user_id,
      activity_id: activity_id,
      gold_spent: GOLD_COST,
    })

    if (purchaseError) {
      console.error("Failed to record purchase:", purchaseError)
    }

    // 6. 예측 데이터 반환 (이미 위에서 조회함)
    return NextResponse.json({
      success: true,
      already_purchased: false,
      new_balance: spendResult.new_balance,
      gold_spent: GOLD_COST,
      predictions: predictions || [],
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
