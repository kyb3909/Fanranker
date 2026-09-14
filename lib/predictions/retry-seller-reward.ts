import * as Sentry from "@sentry/nextjs"

type SupabaseClient = {
  rpc: (
    fn: string,
    params: Record<string, unknown>
  ) => { data?: unknown; error: unknown } | PromiseLike<{ data?: unknown; error: unknown }>
  from: (table: string) => {
    insert: (
      data: Record<string, unknown>
    ) => { data?: unknown; error: unknown } | PromiseLike<{ data?: unknown; error: unknown }>
  }
}

interface SellerRewardContext {
  sellerId: string
  buyerId: string
  activityId: string
  purchaseId?: string | null
  amount: number
  description: string
  transactionType?: string
}

/**
 * 분석글 판매자 정산 — inline 3회 retry, 모두 실패 시 pending_seller_rewards에 기록.
 * lib/betman/refund-tokens.ts 패턴과 동일.
 *
 * @returns true = RPC 성공 / false = 모든 retry 실패 후 큐에 기록됨 (호출자가 알림 메시지 분기 가능)
 */
export async function retrySellerReward(
  supabase: SupabaseClient,
  ctx: SellerRewardContext,
  maxRetries = 3
): Promise<boolean> {
  const transactionType = ctx.transactionType ?? "analysis_sale_revenue"

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (!ctx.purchaseId) break
    try {
      const { data, error } = await supabase.rpc("pay_analysis_seller", {
        p_purchase_id: ctx.purchaseId,
      })
      if (!error && data && typeof data === "object" && "success" in data && data.success === true)
        return true
      console.error(`pay_analysis_seller attempt ${attempt}/${maxRetries} failed:`, error)
    } catch (error) {
      // A lost HTTP acknowledgement may already have committed the payment.
      // Retry the same purchase identifier; the receipt prevents double payment.
      console.error(`pay_analysis_seller attempt ${attempt}/${maxRetries} unavailable:`, error)
    }
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 500 * attempt))
  }

  // 모든 retry 실패 — admin 큐에 기록
  let queueError: unknown = null
  try {
    const result = await supabase.from("pending_seller_rewards").insert({
      seller_id: ctx.sellerId,
      buyer_id: ctx.buyerId,
      activity_id: ctx.activityId,
      purchase_id: ctx.purchaseId ?? null,
      amount: ctx.amount,
      description: ctx.description,
      transaction_type: transactionType,
      attempts: maxRetries,
      last_error: "All retry attempts failed",
    })
    queueError = result.error
  } catch (error) {
    queueError = error
  }

  if (queueError) {
    // 이중 실패 — RPC도 실패하고 큐 기록조차 실패. audit trail 0.
    console.error("pending_seller_rewards INSERT failed:", queueError)
    Sentry.captureMessage(
      `pay_analysis_seller AND pending_seller_rewards INSERT both failed — payment acknowledgement and recovery queue unavailable; reconcile purchase receipt`,
      {
        level: "fatal",
        extra: {
          sellerId: ctx.sellerId,
          buyerId: ctx.buyerId,
          activityId: ctx.activityId,
          purchaseId: ctx.purchaseId,
          amount: ctx.amount,
          queueError: String(queueError),
        },
      }
    )
  } else {
    Sentry.captureMessage(
      `pay_analysis_seller failed after ${maxRetries} retries — recorded in pending_seller_rewards`,
      {
        level: "fatal",
        extra: {
          sellerId: ctx.sellerId,
          buyerId: ctx.buyerId,
          activityId: ctx.activityId,
          amount: ctx.amount,
        },
      }
    )
  }

  return false
}
