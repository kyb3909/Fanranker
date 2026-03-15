import { describe, it, expect, vi } from "vitest"
import { retryRefundTokens } from "@/lib/betman/refund-tokens"

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}))

function createMockSupabase(rpcResults: ({ error: unknown } | PromiseLike<{ error: unknown }>)[]) {
  let callIndex = 0
  const insertMock = vi.fn().mockReturnValue({ error: null })
  return {
    supabase: {
      rpc: vi.fn().mockImplementation(() => {
        const result = rpcResults[callIndex] ?? { error: null }
        callIndex++
        return result
      }),
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    },
    insertMock,
  }
}

describe("retryRefundTokens", () => {
  it("succeeds on first attempt", async () => {
    const { supabase } = createMockSupabase([{ error: null }])
    await retryRefundTokens(supabase, "user-1", 5, "테스트 환불", 3)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith("refund_tokens", {
      p_user_id: "user-1",
      p_amount: 5,
      p_description: "테스트 환불",
    })
  })

  it("retries on failure and succeeds on second attempt", async () => {
    const { supabase } = createMockSupabase([{ error: new Error("timeout") }, { error: null }])
    await retryRefundTokens(supabase, "user-1", 5, "환불", 3)
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(supabase.from).not.toHaveBeenCalled() // no pending_refunds
  })

  it("records pending_refund after all retries exhausted", async () => {
    const { supabase, insertMock } = createMockSupabase([
      { error: new Error("fail1") },
      { error: new Error("fail2") },
      { error: new Error("fail3") },
    ])
    await retryRefundTokens(supabase, "user-1", 10, "실패 환불", 3)
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
    expect(supabase.from).toHaveBeenCalledWith("pending_refunds")
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      amount: 10,
      description: "실패 환불",
      source: "refund_retry_exhausted",
      attempts: 3,
      last_error: "All retry attempts failed",
    })
  })

  it("respects custom maxRetries", async () => {
    const { supabase } = createMockSupabase([{ error: new Error("fail") }])
    await retryRefundTokens(supabase, "user-1", 5, "환불", 1)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).toHaveBeenCalledWith("pending_refunds")
  })

  it("defaults to 3 retries", async () => {
    const { supabase } = createMockSupabase([
      { error: new Error("1") },
      { error: new Error("2") },
      { error: new Error("3") },
    ])
    await retryRefundTokens(supabase, "user-1", 5, "환불")
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
  })
})
