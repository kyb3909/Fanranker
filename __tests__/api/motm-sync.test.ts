import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ sweep: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: mocks.auth }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/api-error", () => ({ apiError: () => new Response(null, { status: 500 }) }))
vi.mock("@/lib/motm/poll", () => ({ sweepMotmPolls: mocks.sweep }))
import { GET } from "@/app/api/cron/motm-sync/route"

const request = () => new NextRequest("http://localhost/api/cron/motm-sync")
const base = {
  finalized: 0,
  created: [] as unknown[],
  skipped: [] as { matchKey: string; reason: string }[],
  repaired: [] as unknown[],
  errors: [] as { scope: string; message: string }[],
}

describe("motm-sync cron — 부분 장애는 503", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockReturnValue(null)
  })

  it("라인업 없음·얇음·보강 없음·유니크 경합은 정상 200", async () => {
    mocks.sweep.mockResolvedValue({
      ...base,
      skipped: [
        { matchKey: "a", reason: "no_lineup" },
        { matchKey: "b", reason: "thin_lineup" },
        { matchKey: "c", reason: "repair_noop" },
        { matchKey: "d", reason: "insert:23505" },
      ],
    })
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, failures: [] })
  })

  it("LFA 전용 목록 조회 실패(errors)는 폴을 만들었어도 503", async () => {
    mocks.sweep.mockResolvedValue({
      ...base,
      created: [{ matchKey: "k", pollId: "p", candidates: 22, ftSource: "betman" }],
      errors: [{ scope: "lfa_fixtures", message: "lfa-fixture-list:42P01" }],
    })
    const res = await GET(request())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.errors[0].message).toContain("42P01")
    expect(body.created).toHaveLength(1)
  })

  it("보강·삽입 오류나 예외 메시지는 failures 로 503", async () => {
    mocks.sweep.mockResolvedValue({
      ...base,
      skipped: [
        { matchKey: "a", reason: "repair:XX000" },
        { matchKey: "b", reason: "fetch failed" },
      ],
    })
    const res = await GET(request())
    expect(res.status).toBe(503)
    expect((await res.json()).failures).toHaveLength(2)
  })
})
