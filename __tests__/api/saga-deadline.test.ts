import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * 사가 윈도우 마감 cron — outcome 이 stage 로 갈리는 계약을 잠근다.
 * 2026-08-06 점검 F1: stage 필터가 없어 이미 성사(done)된 사가 15건이 9/1 아침
 * "잔류(stayed)"로 오기록될 예정이었다. done→outcome='done' / 나머지→'stayed'.
 */

vi.mock("@/lib/cron/log-run", () => ({
  withCronLog: (_name: string, handler: (request: Request) => Promise<Response>) => handler,
}))

interface UpdateCall {
  table: string
  patch: Record<string, unknown>
  filters: Record<string, unknown>
}

let updateCalls: UpdateCall[] = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      // ⚠️ 모르는 테이블에서 계속 던진다. 이 가드가 제 몫을 했다 — 2026-08-30 `be48a99f` 가
      //    라우트에 saga_reservoir 시효 폐기를 넣고 시험을 안 고쳤을 때 여기서 걸렸다.
      //    편하다고 가드를 풀면 다음 변경은 아무도 모르게 지나간다.
      if (table !== "sagas" && table !== "saga_reservoir") {
        throw new Error(`예상치 못한 테이블: ${table}`)
      }
      return {
        update: (patch: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {}
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[`eq:${col}`] = val
              return chain
            },
            neq: (col: string, val: unknown) => {
              filters[`neq:${col}`] = val
              return chain
            },
            like: (col: string, val: unknown) => {
              filters[`like:${col}`] = val
              return chain
            },
            select: async () => {
              updateCalls.push({ table, patch, filters })
              if (table === "saga_reservoir")
                return { data: [{ id: "r1" }, { id: "r2" }], error: null }
              // done 필터가 있으면 성사 사가 목록, 아니면 잔류 목록을 돌려준다
              const isDone = filters["eq:stage"] === "done"
              return {
                data: isDone ? [{ slug: "salah-in-2026s" }] : [{ slug: "barcola-in-2026s" }],
                error: null,
              }
            },
          }
          return chain
        },
      }
    },
  }),
}))

async function call() {
  const { GET } = await import("@/app/api/cron/saga-deadline/route")
  return GET(
    new Request("http://localhost/api/cron/saga-deadline", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  )
}

describe("GET /api/cron/saga-deadline", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    updateCalls = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("마감 전에는 아무것도 닫지 않는다", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-10T00:00:00+09:00"))

    const body = await (await call()).json()

    expect(body.skipped).toContain("마감 전")
    expect(updateCalls).toHaveLength(0)
  })

  it("마감 후: 성사(done)는 outcome='done', 나머지만 '잔류'로 닫는다", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-01T10:00:00+09:00"))

    const body = await (await call()).json()

    const sagaCalls = updateCalls.filter((c) => c.table === "sagas")
    expect(sagaCalls).toHaveLength(2)

    const doneCall = sagaCalls.find((c) => c.filters["eq:stage"] === "done")
    expect(doneCall).toBeDefined()
    expect(doneCall!.patch).toMatchObject({ status: "closed", outcome: "done" })

    const stayedCall = sagaCalls.find((c) => c.filters["neq:stage"] === "done")
    expect(stayedCall).toBeDefined()
    expect(stayedCall!.patch).toMatchObject({ status: "closed", outcome: "stayed" })
    // 잔류 처리가 done 사가를 절대 덮지 않는다 — neq 필터가 그 보증이다
    expect(stayedCall!.filters["eq:status"]).toBe("active")

    expect(body.closedDone).toEqual(["salah-in-2026s"])
    expect(body.closedStayed).toEqual(["barcola-in-2026s"])
  })

  /**
   * 이적설 시효 (2026-08-30 운영자: "시효 = 이적시장 마감까지").
   * 라우트 `be48a99f` 로 들어왔는데 시험이 안 따라와 그때부터 빨간불이었다.
   */
  it("마감 후: 기계 보류(auto*)만 시효 폐기하고 사람 검수 큐·폐기 사유는 건드리지 않는다", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-01T10:00:00+09:00"))

    const body = await (await call()).json()

    const expiry = updateCalls.find((c) => c.table === "saga_reservoir")
    expect(expiry, "시효 폐기가 아예 안 돌았다").toBeDefined()
    expect(expiry!.patch).toMatchObject({ status: "discarded" })
    // 사람 검수 큐(에러 없는 queued)를 쓸어가지 않는다 — 이 두 필터가 그 보증이다
    expect(expiry!.filters["eq:status"]).toBe("queued")
    expect(expiry!.filters["like:error"]).toBe("auto%")
    // ⚠️ error 를 지우면 "왜 폐기됐나"가 사라진다.
    //    status=discarded + error=auto_hold:... 조합 자체가 시효 폐기의 기록이다.
    expect(expiry!.patch).not.toHaveProperty("error")
    expect(body.expiredHolds).toBe(2)
  })

  it("마감 전에는 시효 폐기도 안 돈다", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-10T00:00:00+09:00"))
    await call()
    expect(updateCalls.filter((c) => c.table === "saga_reservoir")).toHaveLength(0)
  })

  it("CRON_SECRET 없는 요청은 401", async () => {
    const { GET } = await import("@/app/api/cron/saga-deadline/route")
    const res = await GET(new Request("http://localhost/api/cron/saga-deadline"))
    expect(res.status).toBe(401)
  })
})
