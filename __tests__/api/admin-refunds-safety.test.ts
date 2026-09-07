import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 환불 큐 실행 안전성 (2026-09-08).
 *
 * 잠그는 것:
 *  · 동시 재시도로 환불 RPC 가 두 번 돌지 않는다
 *  · 골드는 자동 재시도를 지원하지 않으므로 서버가 거절한다
 *  · "지급 완료로 기록"은 서버가 **사유를 요구한다** (클라이언트 플래그만으로 못 닫는다)
 *  · 이미 닫힌 건을 다시 닫지 않는다
 *
 * ⚠️ 이 테스트가 지급 경로 전체의 안전을 보장하지는 않는다. RPC 성공 뒤 상태 갱신 전에
 *    프로세스가 죽는 경우의 대사는 아직 없다.
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => authMock(),
}))

let db: ReturnType<typeof makeDb>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => db.client,
}))

const REFUND_ID = "22222222-2222-4222-8222-222222222222"

interface Opts {
  currency?: string | null
  status?: string
  rpcFails?: boolean
}

function makeDb(o: Opts = {}) {
  const state = {
    status: o.status ?? "pending",
    attempts: 0,
    lastError: null as string | null,
    rpcCalls: 0,
    audits: [] as Record<string, unknown>[],
  }

  const client = {
    rpc: async (name: string) => {
      if (name !== "refund_tokens") throw new Error(`unexpected rpc: ${name}`)
      state.rpcCalls++
      return o.rpcFails ? { error: { message: "rpc down" } } : { error: null }
    },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: "admin" } }) }) }),
        }
      }
      if (table === "pending_refunds") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: REFUND_ID,
                  user_id: "u1",
                  amount: 450,
                  currency: o.currency === undefined ? "token" : o.currency,
                  description: "환불",
                  status: state.status,
                  attempts: state.attempts,
                },
              }),
            }),
          }),
          /**
           * `.update(...).eq(...).eq(...).select()` 를 실제처럼 흉내낸다.
           * 필터를 모아뒀다가 종단(select 또는 await)에서 한 번에 평가해야
           * 낙관적 잠금(`status` + `attempts` 동시 조건)을 제대로 검증할 수 있다.
           */
          update: (patch: Record<string, unknown>) => {
            const filters: [string, unknown][] = []
            const passes = () =>
              filters.every(([col, val]) => {
                if (col === "status") return state.status === val
                if (col === "attempts") return state.attempts === val
                return true // id 는 항상 일치한다고 본다
              })
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val])
                return builder
              },
              select: async () => {
                if (!passes()) return { data: [], error: null }
                applyPatch(patch)
                return { data: [{ id: REFUND_ID }], error: null }
              },
              then(resolve: (v: unknown) => void) {
                if (passes()) applyPatch(patch)
                resolve({ data: null, error: null })
              },
            }
            return builder
          },
        }
      }
      if (table === "admin_audit_logs") {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.audits.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }

  function applyPatch(patch: Record<string, unknown>) {
    if (typeof patch.attempts === "number") state.attempts = patch.attempts
    if (typeof patch.status === "string") state.status = patch.status
    if (typeof patch.last_error === "string") state.lastError = patch.last_error
  }

  return { client, state }
}

const req = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: "https://gongnori.fan/api/admin/refunds",
  }) as never

const loadPatch = async () => (await import("@/app/api/admin/refunds/route")).PATCH

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  authMock.mockResolvedValue({ userId: "admin-1", id: "admin-1" })
  db = makeDb()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("PATCH /api/admin/refunds — 자동 재시도", () => {
  it("성공하면 환불 RPC 를 한 번 부르고 큐를 닫는다", async () => {
    const PATCH = await loadPatch()
    const res = await PATCH(req({ refundId: REFUND_ID, action: "retry", expectedAttempts: 0 }))
    expect(res.status).toBe(200)
    expect(db.state.rpcCalls).toBe(1)
    expect(db.state.status).toBe("resolved")
  })

  it("화면이 본 시도 횟수가 다르면 실행하지 않는다", async () => {
    db.state.attempts = 2
    const PATCH = await loadPatch()
    const res = await PATCH(req({ refundId: REFUND_ID, action: "retry", expectedAttempts: 0 }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.staleView).toBe(true)
    expect(db.state.rpcCalls).toBe(0)
  })

  it("동시에 두 번 눌러도 환불 RPC 는 한 번만 돈다", async () => {
    const PATCH = await loadPatch()
    const [a, b] = await Promise.all([
      PATCH(req({ refundId: REFUND_ID, action: "retry", expectedAttempts: 0 })),
      PATCH(req({ refundId: REFUND_ID, action: "retry", expectedAttempts: 0 })),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(db.state.rpcCalls).toBe(1)
  })

  it("골드는 자동 재시도를 거절한다", async () => {
    db = makeDb({ currency: "gold" })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ refundId: REFUND_ID, action: "retry" }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toContain("자동 재시도를 지원하지 않습니다")
    expect(db.state.rpcCalls).toBe(0)
  })

  it("RPC 실패는 오류를 남기고 큐를 닫지 않는다", async () => {
    db = makeDb({ rpcFails: true })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ refundId: REFUND_ID, action: "retry", expectedAttempts: 0 }))
    expect(res.status).toBe(500)
    expect(db.state.status).toBe("pending")
    expect(db.state.lastError).toContain("rpc down")
  })
})

describe("PATCH /api/admin/refunds — 지급 완료로 기록", () => {
  it("사유가 없으면 서버가 거절한다 (클라이언트 플래그만으로는 못 닫는다)", async () => {
    const PATCH = await loadPatch()
    const res = await PATCH(req({ refundId: REFUND_ID, action: "resolve", paidConfirmed: true }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.requiresNote).toBe(true)
    expect(db.state.status).toBe("pending")
  })

  it("확인 플래그가 없으면 거절한다", async () => {
    const PATCH = await loadPatch()
    const res = await PATCH(
      req({ refundId: REFUND_ID, action: "resolve", resolveNote: "경제조정으로 지급" })
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.requiresConfirmation).toBe(true)
  })

  it("사유와 확인이 있으면 닫히고 돈은 움직이지 않는다", async () => {
    const PATCH = await loadPatch()
    const res = await PATCH(
      req({
        refundId: REFUND_ID,
        action: "resolve",
        paidConfirmed: true,
        resolveNote: "경제조정 화면에서 골드 450 수동 지급",
      })
    )
    expect(res.status).toBe(200)
    expect(db.state.status).toBe("resolved")
    // resolve 는 지급이 아니다 — RPC 를 부르지 않는다
    expect(db.state.rpcCalls).toBe(0)
    const audit = db.state.audits[0] as { details: Record<string, unknown> }
    expect(audit.details.resolveNote).toContain("수동 지급")
  })

  it("이미 처리된 항목은 다시 닫지 않는다", async () => {
    db = makeDb({ status: "resolved" })
    const PATCH = await loadPatch()
    const res = await PATCH(
      req({
        refundId: REFUND_ID,
        action: "resolve",
        paidConfirmed: true,
        resolveNote: "이미 지급함",
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("이미 처리된 항목")
  })
})
