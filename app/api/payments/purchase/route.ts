import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import * as Sentry from "@sentry/nextjs"
import { z } from "zod"

const PurchaseSchema = z.object({
  prediction_id: z.string().min(1, "예측 ID가 필요합니다."),
})

/**
 * POST /api/payments/purchase
 *
 * Purchase a premium prediction content (one-time purchase)
 *
 * Body:
 * - prediction_id: string (required) - Prediction ID to purchase
 *
 * Note: This uses token-based system. For production, integrate with Stripe or other payment gateway.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const result = PurchaseSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 입력입니다.")
    }
    const { prediction_id } = result.data

    // Check if prediction exists and is premium
    const { data: prediction, error: predError } = await supabase
      .from("predictions")
      .select("id, user_id, is_premium, price, analysis_text")
      .eq("id", prediction_id)
      .single()

    if (predError || !prediction) {
      return NextResponse.json({ error: "예측을 찾을 수 없습니다." }, { status: 404 })
    }

    if (!prediction.is_premium) {
      return NextResponse.json({ error: "이 예측은 유료 콘텐츠가 아닙니다." }, { status: 400 })
    }

    if (!prediction.price || prediction.price <= 0) {
      return NextResponse.json({ error: "유효하지 않은 가격입니다." }, { status: 400 })
    }

    // Check if user already purchased this content
    const { data: existingPurchase } = await supabase
      .from("purchased_content")
      .select("id")
      .eq("user_id", userId)
      .eq("prediction_id", prediction_id)
      .single()

    if (existingPurchase) {
      return NextResponse.json(
        { error: "이미 구매한 콘텐츠입니다.", already_purchased: true },
        { status: 400 }
      )
    }

    // Check if user has an active subscription to the expert
    const { data: subscription } = await supabase.rpc("is_subscription_active", {
      p_subscriber_id: userId,
      p_expert_id: prediction.user_id,
    })

    if (subscription) {
      // User has active subscription, grant access without payment
      const { data: purchase, error: purchaseError } = await supabase
        .from("purchased_content")
        .insert({
          user_id: userId,
          prediction_id: prediction_id,
          purchase_price: 0, // Free due to subscription
        })
        .select()
        .single()

      if (purchaseError) {
        return apiError("구매 기록 생성 중 오류가 발생했습니다.", 500, purchaseError)
      }

      return NextResponse.json({
        success: true,
        message: "구독으로 인해 무료로 열람 가능합니다.",
        purchase,
        via_subscription: true,
      })
    }

    // Atomic token deduction via RPC (prevents race conditions)
    const { data: spendResult, error: rpcError } = (await supabase
      .rpc("spend_tokens", {
        p_user_id: userId,
        p_amount: prediction.price,
        p_description: `Premium prediction purchase: ${prediction_id}`,
        p_related_prediction_id: prediction_id,
      })
      .single()) as {
      data: { success: boolean; remaining_balance: number; error_message: string | null } | null
      error: unknown
    }

    if (rpcError || !spendResult) {
      return apiError("토큰 차감 중 오류가 발생했습니다.", 500, rpcError)
    }

    if (!spendResult.success) {
      return NextResponse.json({ error: spendResult.error_message }, { status: 400 })
    }

    // Record purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchased_content")
      .insert({
        user_id: userId,
        prediction_id: prediction_id,
        purchase_price: prediction.price,
      })
      .select()
      .single()

    if (purchaseError) {
      await retryRefundTokens(supabase, userId, prediction.price, "구매 기록 실패 환불")
      return apiError("구매 기록 생성 중 오류가 발생했습니다.", 500, purchaseError)
    }

    return NextResponse.json({
      success: true,
      message: "구매가 완료되었습니다.",
      purchase,
      new_balance: spendResult.remaining_balance,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * GET /api/payments/purchase
 *
 * Check if user has purchased specific content
 *
 * Query Parameters:
 * - prediction_id: string (required) - Prediction ID to check
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ purchased: false })
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get("prediction_id")

    if (!predictionId) {
      return NextResponse.json({ error: "예측 ID가 필요합니다." }, { status: 400 })
    }

    // Check direct purchase
    const { data: purchase } = await supabase
      .from("purchased_content")
      .select("id")
      .eq("user_id", userId)
      .eq("prediction_id", predictionId)
      .single()

    if (purchase) {
      return NextResponse.json({ purchased: true, via_subscription: false })
    }

    // Check subscription access
    const { data: prediction } = await supabase
      .from("predictions")
      .select("user_id")
      .eq("id", predictionId)
      .single()

    if (prediction) {
      const { data: hasSubscription } = await supabase.rpc("is_subscription_active", {
        p_subscriber_id: userId,
        p_expert_id: prediction.user_id,
      })

      if (hasSubscription) {
        return NextResponse.json({ purchased: true, via_subscription: true })
      }
    }

    return NextResponse.json({ purchased: false })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ purchased: false })
  }
}

async function retryRefundTokens(
  supabase: {
    rpc: (
      fn: string,
      params: Record<string, unknown>
    ) => { error: unknown } | PromiseLike<{ error: unknown }>
  },
  userId: string,
  amount: number,
  description: string,
  maxRetries = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await supabase.rpc("refund_tokens", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
    })
    if (!error) return
    console.error(`refund_tokens attempt ${attempt}/${maxRetries} failed:`, error)
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 500 * attempt))
  }
  Sentry.captureMessage(`refund_tokens failed after ${maxRetries} retries`, {
    level: "fatal",
    extra: { userId, amount, description },
  })
}
