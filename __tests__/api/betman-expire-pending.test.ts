import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

/**
 * POST /api/betman/expire-pending — 라우트를 실제로 import 해서 검증한다.
 *
 * 2026-08-08 감사 P1-1에서 SQL 함수(독립 2번째 정산 구현)를 "취소 +
 * settlePredictions 경유"로 교체했다 — 이 파일은 그 교체의 계약을 잠근다:
 *   1. CRON_SECRET 인증 실패면 아무것도 안 한다
 *   2. 결과가 이미 있는 경기는 건드리지 않는다 (쿼리가 result IS NULL 로 한정)
 *   3. 취소는 조건부 갱신(CAS) — status=pending 인 행만
 *   4. 슬립 정산은 settlePredictions 정본 경유 (games 빈 배열 + actor 지정)
 *   5. 대상 0건이면 정산 로직을 아예 호출하지 않는다
 */

/* ────────── 모듈 목 ────────── */

const cronAuthMock = vi.fn<() => NextResponse | null>(() => null)
vi.mock("@/lib/cron-auth", () => ({
  verifyCronSecret: () => cronAuthMock(),
}))

const settleMock = vi.fn()
vi.mock("@/lib/betman/settle", () => ({
  settlePredictions: (...args: unknown[]) => settleMock(...args),
}))

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))

/* ────────── Supabase 목 ────────── */

const staleRow = (over: Record<string, unknown> = {}) => ({
  id: "pred-1",
  user_id: "user-1",
  game_id: "game-1",
  prediction: "home",
  status: "pending",
  stake: 3,
  slip_id: "slip-1",
  locked_odds: 2.1,
  betman_games: { match_time: "2026-08-01T00:00:00Z", result: null },
  ...over,
})

interface Opts {
  staleRows?: Record<string, unknown>[]
  staleError?: { message: string } | null
  updateError?: { message: string } | null
}

function makeSupabase(o: Opts = {}) {
  const staleRows = o.staleRows ?? [staleRow()]
  const calls = {
    selectFilters: [] as Array<{ method: string; args: unknown[] }>,
    updatePayload: null as Record<string, unknown> | null,
    updateInIds: null as unknown,
    updateStatusEq: null as unknown,
  }

  const client = {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {}
      let op: "select" | "update" | null = null
      Object.assign(chain, {
        select: vi.fn((..._a: unknown[]) => {
          if (op === "update") {
            // update 체인의 마지막 .select("id") — 갱신된 행 반환
            return Promise.resolve(
              o.updateError
                ? { data: null, error: o.updateError }
                : { data: staleRows.map((r) => ({ id: r.id })), error: null }
            )
          }
          op = "select"
          return chain
        }),
        eq: vi.fn((col: string, val: unknown) => {
          if (op === "update") calls.updateStatusEq = val
          else calls.selectFilters.push({ method: "eq", args: [col, val] })
          return chain
        }),
        lt: vi.fn((...args: unknown[]) => {
          calls.selectFilters.push({ method: "lt", args })
          return chain
        }),
        is: vi.fn((...args: unknown[]) => {
          calls.selectFilters.push({ method: "is", args })
          return chain
        }),
        limit: vi.fn(async () => ({
          data: o.staleError ? null : staleRows,
          error: o.staleError ?? null,
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          op = "update"
          calls.updatePayload = payload
          return chain
        }),
        in: vi.fn((_col: string, ids: unknown) => {
          calls.updateInIds = ids
          return chain
        }),
      })
      return chain
    }),
  }

  return { client, calls }
}

/* ────────── 테스트 ────────── */

async function callRoute() {
  const route = await import("@/app/api/betman/expire-pending/route")
  return route.POST(new Request("http://test/api/betman/expire-pending") as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  cronAuthMock.mockReturnValue(null)
  settleMock.mockResolvedValue({
    settled: 0,
    correct: 0,
    wrong: 0,
    cancelled: 0,
    slipsWon: 0,
    slipsLost: 1,
    totalPayout: 0,
    statsUpdated: 1,
    errors: [],
  })
  supabaseMock = makeSupabase()
})

describe("POST /api/betman/expire-pending", () => {
  it("CRON_SECRET 인증 실패면 그대로 거부 — DB 접근 0", async () => {
    cronAuthMock.mockReturnValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }))
    const res = await callRoute()
    expect(res.status).toBe(401)
    expect(supabaseMock.client.from).not.toHaveBeenCalled()
    expect(settleMock).not.toHaveBeenCalled()
  })

  it("조회는 pending + 결과 없음(result IS NULL)으로 한정 — 결과 있는 경기는 settle-pending 몫", async () => {
    await callRoute()
    const filters = supabaseMock.calls.selectFilters
    expect(filters).toContainEqual({ method: "eq", args: ["status", "pending"] })
    expect(filters.some((f) => f.method === "is" && f.args[0] === "betman_games.result")).toBe(true)
    expect(filters.some((f) => f.method === "lt" && f.args[0] === "betman_games.match_time")).toBe(
      true
    )
  })

  it("취소는 CAS — 대상 id 목록 + status=pending 조건부, cancelled 페이로드", async () => {
    await callRoute()
    expect(supabaseMock.calls.updatePayload).toMatchObject({
      status: "cancelled",
      is_correct: null,
      points_earned: 0,
    })
    expect(supabaseMock.calls.updateInIds).toEqual(["pred-1"])
    expect(supabaseMock.calls.updateStatusEq).toBe("pending")
  })

  it("슬립 정산은 settlePredictions 정본 경유 — games 빈 배열 + actor 지정", async () => {
    const res = await callRoute()
    expect(settleMock).toHaveBeenCalledTimes(1)
    const [, games, preds, options] = settleMock.mock.calls[0]
    expect(games).toEqual([])
    expect(preds).toHaveLength(1)
    expect(preds[0]).toMatchObject({ id: "pred-1", slip_id: "slip-1", user_id: "user-1" })
    expect(options).toEqual({ actor: "cron:expire-stale" })
    const body = (await res.json()) as { result: { expired_count: number } }
    expect(res.status).toBe(200)
    expect(body.result.expired_count).toBe(1)
  })

  it("대상 0건이면 정산 로직을 호출하지 않는다", async () => {
    supabaseMock = makeSupabase({ staleRows: [] })
    const res = await callRoute()
    expect(settleMock).not.toHaveBeenCalled()
    const body = (await res.json()) as { result: { expired_count: number } }
    expect(body.result.expired_count).toBe(0)
  })

  it("조회 실패는 500 — 취소/정산으로 진행하지 않는다", async () => {
    supabaseMock = makeSupabase({ staleError: { message: "boom" } })
    const res = await callRoute()
    expect(res.status).toBe(500)
    expect(settleMock).not.toHaveBeenCalled()
    expect(supabaseMock.calls.updatePayload).toBeNull()
  })
})
