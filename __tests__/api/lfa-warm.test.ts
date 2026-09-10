import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const m = vi.hoisted(() => ({ warm: vi.fn(), fixtures: vi.fn(), recover: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: m.auth }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: m.warm }))
vi.mock("@/lib/match/get-fixtures", () => ({
  getFixturesForDay: m.fixtures,
  todayKst: () => "2026-09-10",
}))
vi.mock("@/lib/match/recover-materials", () => ({ recoverMatchMaterials: m.recover }))
import { GET } from "@/app/api/cron/lfa-warm/route"

describe("date warming owns no material recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.auth.mockReturnValue(null)
    m.warm.mockResolvedValue(new Map())
  })
  it("warms today and tomorrow without borrowing recovery's execution budget", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/lfa-warm"))
    expect(res.status).toBe(200)
    expect(m.warm.mock.calls).toEqual([["2026-09-10"], ["2026-09-11"]])
    expect(m.fixtures).not.toHaveBeenCalled()
    expect(m.recover).not.toHaveBeenCalled()
  })
  it("does not warm unauthorized requests", async () => {
    m.auth.mockReturnValue(new Response(null, { status: 401 }))
    expect((await GET(new NextRequest("http://localhost/api/cron/lfa-warm"))).status).toBe(401)
    expect(m.warm).not.toHaveBeenCalled()
  })
})
