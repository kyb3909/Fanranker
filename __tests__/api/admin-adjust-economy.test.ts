import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 관리자 수동 경제 조정 — **임의 금액을 직접 쓰는 유일한 경로**라 폭발 반경이 가장 크다.
 *
 * 여기서 잠그는 핵심 계약: 잔액과 거래기록(balance_after)이 **항상 일치**한다.
 * 예전엔 잔액만 클램프 없이 써서 500볼 유저에게 -1000 을 넣으면 실제 잔액 -500,
 * 장부에는 0 으로 남아 대조가 안 맞았다(실피해 0건이었지만 조용한 폭탄).
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => authMock(),
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))
vi.mock("@/lib/admin/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIpFromRequest: () => null,
}))

interface Opts {
  /** 조정 대상의 현재 볼 잔액 */
  tokenBalance?: number | null
  /** 요청자 역할 */
  role?: string
}

function makeSupabase(o: Opts = {}) {
  const calls = {
    tokenUpdates: [] as Record<string, unknown>[],
    txInserts: [] as Record<string, unknown>[],
  }

  const client = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role: o.role ?? "admin" }, error: null }),
            }),
          }),
        }
      }
      if (table === "user_tokens") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  o.tokenBalance === null || o.tokenBalance === undefined
                    ? null
                    : { token_balance: o.tokenBalance },
                error: null,
              }),
            }),
          }),
          update: (row: Record<string, unknown>) => {
            calls.tokenUpdates.push(row)
            return { eq: async () => ({ error: null }) }
          },
          insert: async (row: Record<string, unknown>) => {
            calls.tokenUpdates.push(row)
            return { error: null }
          },
        }
      }
      if (table === "token_transactions") {
        return {
          // 멱등키 중복 조회
          select: () => ({
            eq: function () {
              return this
            },
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
          insert: async (row: Record<string, unknown>) => {
            calls.txInserts.push(row)
            return { error: null }
          },
        }
      }
      // 그 외 테이블은 조용히 성공
      return {
        select: () => ({
          eq: function () {
            return this
          },
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }
    },
  }
  return { client, calls }
}

const req = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: "https://gongnori.fan/api/admin/users/u1/adjust-economy",
  }) as never

const loadRoute = async () =>
  (await import("@/app/api/admin/users/[userId]/adjust-economy/route")).POST

const ctx = { params: Promise.resolve({ userId: "target-user" }) } as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  authMock.mockResolvedValue({ userId: "admin-1", id: "admin-1" })
  supabaseMock = makeSupabase()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST adjust-economy — 잔액·장부 일치 계약", () => {
  it("차감 결과가 음수가 되면 0 으로 막는다 (음수 잔액 금지)", async () => {
    supabaseMock = makeSupabase({ tokenBalance: 500 })
    const POST = await loadRoute()

    const res = await POST(
      req({
        type: "token",
        amount: -1000,
        reason: "테스트 차감",
        idempotency_key: "3f0a2b1c-1234-4abc-9def-000000000010",
      }),
      ctx
    )

    expect(res.status).toBe(200)
    const written = supabaseMock.calls.tokenUpdates[0]
    expect(written.token_balance).toBe(0)
  })

  it("★ 잔액과 거래기록(balance_after)이 일치한다 — 대조가 어긋나면 안 된다", async () => {
    supabaseMock = makeSupabase({ tokenBalance: 500 })
    const POST = await loadRoute()

    await POST(
      req({
        type: "token",
        amount: -1000,
        reason: "테스트",
        idempotency_key: "3f0a2b1c-1234-4abc-9def-000000000011",
      }),
      ctx
    )

    const balance = supabaseMock.calls.tokenUpdates[0].token_balance
    const ledger = supabaseMock.calls.txInserts[0].balance_after
    expect(ledger).toBe(balance)
  })

  it("정상 차감은 그대로 반영된다", async () => {
    supabaseMock = makeSupabase({ tokenBalance: 500 })
    const POST = await loadRoute()

    await POST(
      req({
        type: "token",
        amount: -200,
        reason: "테스트",
        idempotency_key: "3f0a2b1c-1234-4abc-9def-000000000012",
      }),
      ctx
    )

    expect(supabaseMock.calls.tokenUpdates[0].token_balance).toBe(300)
    expect(supabaseMock.calls.txInserts[0].balance_after).toBe(300)
  })

  it("지급도 정상 반영된다", async () => {
    supabaseMock = makeSupabase({ tokenBalance: 10 })
    const POST = await loadRoute()

    await POST(
      req({
        type: "token",
        amount: 90,
        reason: "보상",
        idempotency_key: "3f0a2b1c-1234-4abc-9def-000000000013",
      }),
      ctx
    )

    expect(supabaseMock.calls.tokenUpdates[0].token_balance).toBe(100)
  })

  it("admin 이 아니면 조정할 수 없다", async () => {
    supabaseMock = makeSupabase({ tokenBalance: 500, role: "editor" })
    const POST = await loadRoute()

    const res = await POST(
      req({
        type: "token",
        amount: -100,
        reason: "시도",
        idempotency_key: "3f0a2b1c-1234-4abc-9def-000000000014",
      }),
      ctx
    )

    expect(res.status).toBe(403)
    expect(supabaseMock.calls.tokenUpdates).toHaveLength(0)
  })
})
