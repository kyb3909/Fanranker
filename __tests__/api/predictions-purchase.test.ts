import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * POST /api/predictions/purchase — **라우트를 실제로 import 해서** 검증한다.
 * (기존 파일은 상수·헬퍼 복사본만 검증하는 미러였다 — test-gaps.md P5)
 *
 * 지키는 계약 — 골드가 움직이는 유일한 구매 경로다:
 *   1. 열람 불가 판정(404·자기 예측·경기 종료 무료·이미 구매)은 골드 차감 전에 끝난다
 *   2. spend_gold 반환 키는 `remaining` 이다 (spend_tokens 의 remaining_balance 와
 *      다르다 — 과거 실제 버그 지점)
 *   3. 차감 성공 후 구매 기록 실패 → reward_gold 환불, 3회 모두 실패 시
 *      pending_refunds 에 currency='gold' 로 큐잉 (골드 증발 방지 — 2026-07-28 수정분)
 *   4. 성공 시 판매자 정산은 retrySellerReward 로 위임 (450골드 = 90%)
 */

const currentUserMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: () => currentUserMock(),
}))

const retrySellerRewardMock = vi.fn().mockResolvedValue(true)
vi.mock("@/lib/predictions/retry-seller-reward", () => ({
  retrySellerReward: (...args: unknown[]) => retrySellerRewardMock(...args),
}))

const sentryCaptureMock = vi.fn()
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => sentryCaptureMock(...args),
  captureException: vi.fn(),
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))

/* ────────── Supabase 목 ────────── */

interface Opts {
  /** prediction_activities row (null 이면 404) */
  activity?: Record<string, unknown> | null
  /** 판매자의 예측 목록 (경기 시간 판정용) */
  predictions?: Record<string, unknown>[]
  /** 이미 구매했는가 */
  existingPurchase?: { id: string } | null
  /** spend_gold RPC 결과 */
  spend?: { success: boolean; remaining?: number; error_message?: string }
  /** prediction_purchases insert 실패 */
  purchaseInsertFails?: boolean
  /** reward_gold (환불) RPC 실패 */
  refundFails?: boolean
}

const FUTURE = new Date(Date.now() + 3600_000).toISOString()
const PAST = new Date(Date.now() - 3600_000).toISOString()

const baseActivity = (over: Record<string, unknown> = {}) => ({
  id: "act-1",
  user_id: "seller-1",
  round_id: "round-1",
  sport: "축구",
  ...over,
})

function makeSupabase(o: Opts = {}) {
  const activity = o.activity === undefined ? baseActivity() : o.activity
  const predictions = o.predictions ?? [{ id: "p1", game: { match_time: FUTURE } }]
  const spend = o.spend ?? { success: true, remaining: 500, spent: 500 }
  const calls = {
    rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    purchaseInserts: [] as Record<string, unknown>[],
    pendingRefundInserts: [] as Record<string, unknown>[],
  }

  const client = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args })
      if (fn === "reward_gold") {
        // 환불 — .single() 없이 await
        return Promise.resolve(
          o.refundFails ? { error: { message: "refund down" } } : { error: null }
        )
      }
      return { single: async () => ({ data: spend, error: null }) }
    }),
    from: vi.fn((table: string) => {
      if (table === "prediction_activities") {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                activity
                  ? { data: activity, error: null }
                  : { data: null, error: { code: "PGRST116" } },
            }),
          }),
        }
      }
      if (table === "betman_predictions") {
        return {
          select: () => ({
            eq: function () {
              return this
            },
            then: (res: (v: unknown) => unknown) =>
              Promise.resolve({ data: predictions, error: null }).then(res),
          }),
        }
      }
      if (table === "prediction_purchases") {
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
                    : { data: { id: "purchase-1" }, error: null },
              }),
            }
          },
        }
      }
      if (table === "pending_refunds") {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.pendingRefundInserts.push(row)
            return { error: null }
          },
        }
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { nickname: "구매자" }, error: null }),
            }),
          }),
        }
      }
      if (table === "notifications") {
        return { insert: async () => ({ error: null }) }
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
    url: "https://gongnori.fan/api/predictions/purchase",
  }) as never

const loadRoute = async () => (await import("@/app/api/predictions/purchase/route")).POST

const spendGoldCalls = () => supabaseMock.calls.rpc.filter((c) => c.fn === "spend_gold")
const refundCalls = () => supabaseMock.calls.rpc.filter((c) => c.fn === "reward_gold")

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  currentUserMock.mockResolvedValue({ id: "buyer-1" })
  retrySellerRewardMock.mockResolvedValue(true)
  supabaseMock = makeSupabase()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/predictions/purchase — 골드 구매 계약", () => {
  it("비로그인 → 401, 골드 차감 미호출", async () => {
    currentUserMock.mockResolvedValue(null)
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))
    expect(res.status).toBe(401)
    expect(spendGoldCalls()).toHaveLength(0)
  })

  it("존재하지 않는 활동 → 404, 차감 미호출", async () => {
    supabaseMock = makeSupabase({ activity: null })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "nope" }))
    expect(res.status).toBe(404)
    expect(spendGoldCalls()).toHaveLength(0)
  })

  it("자기 자신의 예측 → 400, 차감 미호출 (무료 열람 대상)", async () => {
    supabaseMock = makeSupabase({ activity: baseActivity({ user_id: "buyer-1" }) })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))
    expect(res.status).toBe(400)
    expect(spendGoldCalls()).toHaveLength(0)
  })

  it("모든 경기가 끝났으면 무료 열람 (is_free) — 차감 미호출", async () => {
    supabaseMock = makeSupabase({
      predictions: [
        { id: "p1", game: { match_time: PAST } },
        { id: "p2", game: { match_time: PAST } },
      ],
    })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.is_free).toBe(true)
    expect(spendGoldCalls()).toHaveLength(0)
  })

  it("이미 구매한 활동 → already_purchased, 차감 미호출 (이중 결제 방지)", async () => {
    supabaseMock = makeSupabase({ existingPurchase: { id: "purchase-0" } })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.already_purchased).toBe(true)
    expect(spendGoldCalls()).toHaveLength(0)
  })

  it("골드 부족 → 400 + gold_balance 는 RPC 의 remaining 키에서 온다 (반환 키 계약)", async () => {
    supabaseMock = makeSupabase({
      spend: { success: false, remaining: 120, error_message: "골드가 부족합니다" },
    })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.gold_balance).toBe(120)
    expect(supabaseMock.calls.purchaseInserts).toHaveLength(0)
  })

  it("성공 — 500골드 차감, 판매자 450골드 정산 위임, new_balance=remaining", async () => {
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))

    expect(res.status).toBe(200)
    expect(spendGoldCalls()).toHaveLength(1)
    expect(spendGoldCalls()[0].args).toMatchObject({ p_user_id: "buyer-1", p_amount: 500 })
    expect(retrySellerRewardMock).toHaveBeenCalledTimes(1)
    expect(retrySellerRewardMock.mock.calls[0][1]).toMatchObject({
      sellerId: "seller-1",
      amount: 450,
    })
    const body = await res.json()
    expect(body.new_balance).toBe(500)
    expect(body.gold_spent).toBe(500)
  })

  it("차감 후 구매 기록 실패 → reward_gold 로 500골드 환불 (증발 방지)", async () => {
    supabaseMock = makeSupabase({ purchaseInsertFails: true })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))

    expect(res.status).toBe(500)
    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].args).toMatchObject({ p_user_id: "buyer-1", p_amount: 500 })
    expect(retrySellerRewardMock).not.toHaveBeenCalled() // 실패 구매에 정산 금지
  })

  it("환불 3회 모두 실패 → pending_refunds 에 currency='gold' 로 큐잉 + Sentry fatal", async () => {
    supabaseMock = makeSupabase({ purchaseInsertFails: true, refundFails: true })
    const POST = await loadRoute()
    const res = await POST(req({ activity_id: "act-1" }))

    expect(res.status).toBe(500)
    expect(refundCalls()).toHaveLength(3) // inline 3회 재시도
    expect(supabaseMock.calls.pendingRefundInserts).toHaveLength(1)
    expect(supabaseMock.calls.pendingRefundInserts[0]).toMatchObject({
      user_id: "buyer-1",
      amount: 500,
      currency: "gold", // ← 볼로 잘못 환불되면 안 된다
    })
    expect(sentryCaptureMock).toHaveBeenCalledWith(
      expect.stringContaining("buyer refund failed"),
      expect.objectContaining({ level: "fatal" })
    )
  }, 15000) // 재시도 backoff sleep 1.5s 포함
})
