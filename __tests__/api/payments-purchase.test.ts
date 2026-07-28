import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * POST /api/payments/purchase — **라우트를 실제로 import 해서** 검증한다.
 * (기존 파일은 스키마 복사본만 검증하는 미러였다 — test-gaps.md P5)
 *
 * 지키는 계약:
 *   1. 구매 불가 판정(404·비프리미엄·가격 0·이미 구매)은 볼 차감 전에 끝난다
 *   2. 구독 중이면 차감 없이 0원 구매 기록으로 열람 허용
 *   3. 차감 성공 후 구매 기록 실패 → retryRefundTokens 로 전액 환불 (볼 증발 방지)
 *   4. 응답의 new_balance 는 spend_tokens 의 remaining_balance 키 (반환 키 계약)
 */

const currentUserMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: () => currentUserMock(),
}))

const retryRefundTokensMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/betman/refund-tokens", () => ({
  retryRefundTokens: (...args: unknown[]) => retryRefundTokensMock(...args),
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))

/* ────────── Supabase 목 ────────── */

interface Opts {
  /** predictions row (null 이면 404 경로) */
  prediction?: Record<string, unknown> | null
  /** purchased_content 기존 구매 */
  existingPurchase?: { id: string } | null
  /** is_subscription_active RPC 결과 */
  subscribed?: boolean
  /** spend_tokens RPC 결과 */
  spend?: { success: boolean; remaining_balance: number; error_message: string | null }
  /** purchased_content insert 실패 여부 */
  purchaseInsertFails?: boolean
}

const basePrediction = (over: Record<string, unknown> = {}) => ({
  id: "pred-1",
  user_id: "seller-1",
  is_premium: true,
  price: 5,
  analysis_text: "분석",
  ...over,
})

function makeSupabase(o: Opts = {}) {
  const prediction = o.prediction === undefined ? basePrediction() : o.prediction
  const spend = o.spend ?? { success: true, remaining_balance: 95, error_message: null }
  const calls = {
    rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    purchaseInserts: [] as Record<string, unknown>[],
  }

  const client = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args })
      if (fn === "is_subscription_active") {
        // 라우트가 .single() 없이 await 한다
        return Promise.resolve({ data: o.subscribed ?? false, error: null })
      }
      return { single: async () => ({ data: spend, error: null }) }
    }),
    from: vi.fn((table: string) => {
      if (table === "predictions") {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                prediction
                  ? { data: prediction, error: null }
                  : { data: null, error: { code: "PGRST116" } },
            }),
          }),
        }
      }
      if (table === "purchased_content") {
        return {
          select: () => ({
            eq: function () {
              return this
            },
            single: async () => ({ data: o.existingPurchase ?? null, error: null }),
          }),
          insert: (row: Record<string, unknown>) => {
            calls.purchaseInserts.push(row)
            return {
              select: () => ({
                single: async () =>
                  o.purchaseInsertFails
                    ? { data: null, error: { message: "insert failed" } }
                    : { data: { id: "purchase-1", ...row }, error: null },
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    }),
  }

  return { client, calls }
}

const req = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: "https://gongnori.fan/api/payments/purchase",
  }) as never

const loadRoute = async () => (await import("@/app/api/payments/purchase/route")).POST

const spendCalls = () => supabaseMock.calls.rpc.filter((c) => c.fn === "spend_tokens")

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  currentUserMock.mockResolvedValue({ id: "buyer-1" })
  supabaseMock = makeSupabase()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/payments/purchase — 프리미엄 구매 계약", () => {
  it("비로그인 → 401, 차감 미호출", async () => {
    currentUserMock.mockResolvedValue(null)
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))
    expect(res.status).toBe(401)
    expect(spendCalls()).toHaveLength(0)
  })

  it("존재하지 않는 예측 → 404, 차감 미호출", async () => {
    supabaseMock = makeSupabase({ prediction: null })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "nope" }))
    expect(res.status).toBe(404)
    expect(spendCalls()).toHaveLength(0)
  })

  it("프리미엄이 아닌 예측 → 400, 차감 미호출", async () => {
    supabaseMock = makeSupabase({ prediction: basePrediction({ is_premium: false }) })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))
    expect(res.status).toBe(400)
    expect(spendCalls()).toHaveLength(0)
  })

  it.each([
    ["0", 0],
    ["null", null],
  ])("가격이 %s 인 예측 → 400, 차감 미호출", async (_label, price) => {
    supabaseMock = makeSupabase({ prediction: basePrediction({ price }) })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))
    expect(res.status).toBe(400)
    expect(spendCalls()).toHaveLength(0)
  })

  it("이미 구매한 콘텐츠 → already_purchased, 차감 미호출 (이중 결제 방지)", async () => {
    supabaseMock = makeSupabase({ existingPurchase: { id: "purchase-0" } })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.already_purchased).toBe(true)
    expect(spendCalls()).toHaveLength(0)
  })

  it("구독 중이면 차감 없이 0원 구매 기록으로 열람을 허용한다", async () => {
    supabaseMock = makeSupabase({ subscribed: true })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.via_subscription).toBe(true)
    expect(spendCalls()).toHaveLength(0)
    expect(supabaseMock.calls.purchaseInserts[0]).toMatchObject({ purchase_price: 0 })
  })

  it("잔액 부족(RPC success:false) → 400, 구매 기록 미생성", async () => {
    supabaseMock = makeSupabase({
      spend: { success: false, remaining_balance: 1, error_message: "잔액 부족" },
    })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))

    expect(res.status).toBe(400)
    expect(supabaseMock.calls.purchaseInserts).toHaveLength(0)
  })

  it("성공 — 가격만큼 정확히 1회 차감 + 구매 기록 + remaining_balance 반환 (키 계약)", async () => {
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))

    expect(res.status).toBe(200)
    expect(spendCalls()).toHaveLength(1)
    expect(spendCalls()[0].args).toMatchObject({ p_user_id: "buyer-1", p_amount: 5 })
    expect(supabaseMock.calls.purchaseInserts[0]).toMatchObject({
      user_id: "buyer-1",
      prediction_id: "pred-1",
      purchase_price: 5,
    })
    const body = await res.json()
    expect(body.new_balance).toBe(95)
    expect(retryRefundTokensMock).not.toHaveBeenCalled()
  })

  it("차감 후 구매 기록 실패 → 전액 환불 경로 진입 (볼 증발 방지)", async () => {
    supabaseMock = makeSupabase({ purchaseInsertFails: true })
    const POST = await loadRoute()
    const res = await POST(req({ prediction_id: "pred-1" }))

    expect(res.status).toBe(500)
    expect(retryRefundTokensMock).toHaveBeenCalledTimes(1)
    // (supabase, userId, amount, description)
    expect(retryRefundTokensMock.mock.calls[0][1]).toBe("buyer-1")
    expect(retryRefundTokensMock.mock.calls[0][2]).toBe(5)
  })
})
