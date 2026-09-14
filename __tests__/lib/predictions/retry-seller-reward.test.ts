import { describe, it, expect, vi } from "vitest"
import { retrySellerReward } from "@/lib/predictions/retry-seller-reward"

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}))

function createMockSupabase(
  rpcResults: (
    | { error: unknown; data?: unknown }
    | PromiseLike<{ error: unknown; data?: unknown }>
  )[]
) {
  let callIndex = 0
  const insertMock = vi.fn().mockReturnValue({ error: null, data: { success: true } })
  return {
    supabase: {
      rpc: vi.fn().mockImplementation(() => {
        const result = rpcResults[callIndex] ?? { error: null, data: { success: true } }
        callIndex++
        return result
      }),
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    },
    insertMock,
  }
}

const ctx = {
  sellerId: "seller-1",
  buyerId: "buyer-1",
  activityId: "activity-uuid-1",
  purchaseId: "purchase-uuid-1",
  amount: 450,
  description: "분석글 판매 수익 (soccer)",
}

describe("retrySellerReward", () => {
  it("succeeds on first attempt and returns true", async () => {
    const { supabase } = createMockSupabase([{ error: null, data: { success: true } }])
    const result = await retrySellerReward(supabase, ctx, 3)
    expect(result).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith("pay_analysis_seller", {
      p_purchase_id: "purchase-uuid-1",
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("retries on failure and returns true on eventual success", async () => {
    const { supabase } = createMockSupabase([
      { error: new Error("timeout") },
      { error: null, data: { success: true } },
    ])
    const result = await retrySellerReward(supabase, ctx, 3)
    expect(result).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("returns false and records pending_seller_rewards when retries exhausted", async () => {
    const { supabase, insertMock } = createMockSupabase([
      { error: new Error("fail1") },
      { error: new Error("fail2") },
      { error: new Error("fail3") },
    ])
    const result = await retrySellerReward(supabase, ctx, 3)
    expect(result).toBe(false)
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
    expect(supabase.from).toHaveBeenCalledWith("pending_seller_rewards")
    expect(insertMock).toHaveBeenCalledWith({
      seller_id: "seller-1",
      buyer_id: "buyer-1",
      activity_id: "activity-uuid-1",
      purchase_id: "purchase-uuid-1",
      amount: 450,
      description: "분석글 판매 수익 (soccer)",
      transaction_type: "analysis_sale_revenue",
      attempts: 3,
      last_error: "All retry attempts failed",
    })
  })

  it("uses the purchase identity even when caller passes another transaction type", async () => {
    const { supabase } = createMockSupabase([{ error: null, data: { success: true } }])
    await retrySellerReward(supabase, { ...ctx, transactionType: "custom_type" }, 1)
    expect(supabase.rpc).toHaveBeenCalledWith("pay_analysis_seller", {
      p_purchase_id: ctx.purchaseId,
    })
  })

  it("inserts null purchase_id when not provided", async () => {
    const { supabase, insertMock } = createMockSupabase([{ error: new Error("fail") }])
    const ctxNoPurchase = { ...ctx, purchaseId: undefined }
    await retrySellerReward(supabase, ctxNoPurchase, 1)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ purchase_id: null }))
  })

  it("respects custom maxRetries (1)", async () => {
    const { supabase } = createMockSupabase([{ error: new Error("fail") }])
    await retrySellerReward(supabase, ctx, 1)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).toHaveBeenCalledWith("pending_seller_rewards")
  })

  it("defaults to 3 retries", async () => {
    const { supabase } = createMockSupabase([
      { error: new Error("1") },
      { error: new Error("2") },
      { error: new Error("3") },
    ])
    await retrySellerReward(supabase, ctx)
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
  })

  it("returns false even when both RPC and queue INSERT fail (double-failure path)", async () => {
    const insertMock = vi.fn().mockReturnValue({ error: new Error("queue FK violation") })
    const supabase = {
      rpc: vi.fn().mockReturnValue({ error: new Error("rpc fail") }),
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    }
    const result = await retrySellerReward(supabase, ctx, 1)
    expect(result).toBe(false)
    expect(insertMock).toHaveBeenCalled()
  })
})

describe("transport and RPC result failures", () => {
  it("does not accept a business failure as a successful payout", async () => {
    const { supabase, insertMock } = createMockSupabase([{ error: null, data: { success: false } }])
    expect(await retrySellerReward(supabase, ctx, 1)).toBe(false)
    expect(insertMock).toHaveBeenCalled()
  })
  it("reuses the same purchase after a thrown lost acknowledgement", async () => {
    const { supabase } = createMockSupabase([])
    supabase.rpc
      .mockReset()
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ error: null, data: { success: true, duplicate: true } })
    expect(await retrySellerReward(supabase, ctx, 2)).toBe(true)
    expect(supabase.rpc.mock.calls).toEqual([
      ["pay_analysis_seller", { p_purchase_id: ctx.purchaseId }],
      ["pay_analysis_seller", { p_purchase_id: ctx.purchaseId }],
    ])
  })
  it("records the obligation after thrown RPC failures", async () => {
    const { supabase, insertMock } = createMockSupabase([])
    supabase.rpc.mockRejectedValue(new Error("network lost"))
    expect(await retrySellerReward(supabase, ctx, 1)).toBe(false)
    expect(insertMock).toHaveBeenCalled()
  })
})
