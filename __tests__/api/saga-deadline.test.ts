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
  patch: Record<string, unknown>
  filters: Record<string, unknown>
}

let updateCalls: UpdateCall[] = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table !== "sagas") throw new Error(`예상치 못한 테이블: ${table}`)
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
            select: async () => {
              updateCalls.push({ patch, filters })
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

    expect(updateCalls).toHaveLength(2)

    const doneCall = updateCalls.find((c) => c.filters["eq:stage"] === "done")
    expect(doneCall).toBeDefined()
    expect(doneCall!.patch).toMatchObject({ status: "closed", outcome: "done" })

    const stayedCall = updateCalls.find((c) => c.filters["neq:stage"] === "done")
    expect(stayedCall).toBeDefined()
    expect(stayedCall!.patch).toMatchObject({ status: "closed", outcome: "stayed" })
    // 잔류 처리가 done 사가를 절대 덮지 않는다 — neq 필터가 그 보증이다
    expect(stayedCall!.filters["eq:status"]).toBe("active")

    expect(body.closedDone).toEqual(["salah-in-2026s"])
    expect(body.closedStayed).toEqual(["barcola-in-2026s"])
  })

  it("CRON_SECRET 없는 요청은 401", async () => {
    const { GET } = await import("@/app/api/cron/saga-deadline/route")
    const res = await GET(new Request("http://localhost/api/cron/saga-deadline"))
    expect(res.status).toBe(401)
  })
})
