import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * POST /api/tokens/spend — **라우트를 실제로 import 해서** 검증한다.
 * (기존 파일은 스키마 복사본만 검증하는 미러였다 — test-gaps.md P5)
 *
 * 지키는 계약 — 전부 "볼이 어떻게 되는가"에 대한 것이다:
 *   1. 검증 실패(비로그인·0/음수/소수 금액·깨진 body)는 RPC 호출 전에 끝난다
 *   2. idempotency_key 중복 → 차감 없이 duplicate:true (멱등 계약)
 *   3. spend_tokens 반환 키는 `remaining_balance` 다 (과거 실제 버그 지점 —
 *      new_balance 로 읽으면 잔액이 undefined 로 새어나간다)
 *   4. RPC 실패는 500, 잔액 부족은 400 + 현재 잔액 반환
 */

const currentUserMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: () => currentUserMock(),
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))

/* ────────── Supabase 목 ────────── */

interface Opts {
  /** token_transactions 에 이미 있는 idempotency 트랜잭션 */
  existingTxn?: { id: string } | null
  /** user_tokens 현재 잔액 (중복 응답용) */
  balance?: number
  /** spend_tokens RPC 결과 */
  spend?: { success: boolean; remaining_balance: number; error_message: string | null } | null
  /** RPC 자체가 에러 */
  rpcFails?: boolean
}

function makeSupabase(o: Opts = {}) {
  const spend = o.spend ?? { success: true, remaining_balance: 7, error_message: null }
  const calls = { rpc: [] as Array<{ fn: string; args: Record<string, unknown> }> }

  const client = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args })
      return {
        single: async () =>
          o.rpcFails
            ? { data: null, error: { message: "rpc down" } }
            : { data: spend, error: null },
      }
    }),
    from: vi.fn((table: string) => {
      if (table === "token_transactions") {
        return {
          select: () => ({
            eq: function () {
              return this
            },
            single: async () => ({ data: o.existingTxn ?? null, error: null }),
          }),
        }
      }
      if (table === "user_tokens") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { token_balance: o.balance ?? 42 }, error: null }),
            }),
          }),
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
    url: "https://gongnori.fan/api/tokens/spend",
  }) as never

const loadRoute = async () => (await import("@/app/api/tokens/spend/route")).POST

const spendCalls = () => supabaseMock.calls.rpc.filter((c) => c.fn === "spend_tokens")

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules() // rate-limit 인메모리 카운터 초기화
  currentUserMock.mockResolvedValue({ id: "user-1" })
  supabaseMock = makeSupabase()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/tokens/spend — 볼 차감 계약", () => {
  it("비로그인 → 401, RPC 미호출", async () => {
    currentUserMock.mockResolvedValue(null)
    const POST = await loadRoute()
    const res = await POST(req({ amount: 5 }))
    expect(res.status).toBe(401)
    expect(spendCalls()).toHaveLength(0)
  })

  it.each([
    ["0", 0],
    ["음수", -3],
    ["소수", 1.5],
  ])("amount %s → 400, RPC 미호출", async (_label, amount) => {
    const POST = await loadRoute()
    const res = await POST(req({ amount }))
    expect(res.status).toBe(400)
    expect(spendCalls()).toHaveLength(0)
  })

  it("JSON 이 아닌 body → 400 (500 으로 새지 않음)", async () => {
    const POST = await loadRoute()
    const res = await POST({
      json: async () => {
        throw new SyntaxError("bad json")
      },
      headers: new Headers(),
    } as never)
    expect(res.status).toBe(400)
    expect(spendCalls()).toHaveLength(0)
  })

  it("idempotency_key 중복 → 차감 없이 기존 잔액으로 duplicate 응답 (멱등 계약)", async () => {
    supabaseMock = makeSupabase({ existingTxn: { id: "txn-1" }, balance: 42 })
    const POST = await loadRoute()

    const res = await POST(
      req({ amount: 5, idempotency_key: "3f0a2b1c-1234-4abc-9def-000000000001" })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(body.balance).toBe(42)
    expect(spendCalls()).toHaveLength(0) // ← 두 번 차감되면 안 된다
  })

  it("성공 — spend_tokens 를 정확히 1회, p_amount=요청 금액으로 호출한다", async () => {
    const POST = await loadRoute()
    const res = await POST(req({ amount: 5, description: "test" }))

    expect(res.status).toBe(200)
    expect(spendCalls()).toHaveLength(1)
    expect(spendCalls()[0].args).toMatchObject({ p_user_id: "user-1", p_amount: 5 })
  })

  it("성공 응답의 balance 는 RPC 의 remaining_balance 키에서 온다 (반환 키 계약)", async () => {
    supabaseMock = makeSupabase({
      spend: { success: true, remaining_balance: 3, error_message: null },
    })
    const POST = await loadRoute()
    const res = await POST(req({ amount: 5 }))

    const body = await res.json()
    expect(body).toMatchObject({ success: true, balance: 3, spent: 5 })
  })

  it("잔액 부족(RPC success:false) → 400 + 현재 잔액·필요량 안내", async () => {
    supabaseMock = makeSupabase({
      spend: { success: false, remaining_balance: 2, error_message: "잔액이 부족합니다" },
    })
    const POST = await loadRoute()
    const res = await POST(req({ amount: 5 }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: "잔액이 부족합니다", balance: 2, required: 5 })
  })

  it("RPC 자체가 실패하면 500 (성공으로 새지 않음)", async () => {
    supabaseMock = makeSupabase({ rpcFails: true })
    const POST = await loadRoute()
    const res = await POST(req({ amount: 5 }))
    expect(res.status).toBe(500)
  })
})
