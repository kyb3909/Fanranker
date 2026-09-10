import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const m = vi.hoisted(() => ({
  warm: vi.fn(),
  fixtures: vi.fn(),
  providerFixtures: vi.fn(),
  supplemental: vi.fn(),
  recover: vi.fn(),
  auth: vi.fn(),
}))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: m.auth }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/lfa/match", () => ({ getLfaDayIndex: m.warm }))
vi.mock("@/lib/match/get-fixtures", () => ({
  getBetmanFixturesForDay: m.fixtures,
  getFixturesForDay: m.providerFixtures,
  kstDayRange: (day: string) => {
    const start = Date.parse(`${day}T06:00:00+09:00`)
    return { start: new Date(start).toISOString(), end: new Date(start + 86400_000).toISOString() }
  },
  todayKst: () => "2026-09-10",
}))
vi.mock("@/lib/match/supplemental-fixtures", () => ({
  listSupplementalFixtures: m.supplemental,
  supplementalSummary: (row: { fixture: unknown }) => row.fixture,
}))
vi.mock("@/lib/match/recover-materials", () => ({ recoverMatchMaterials: m.recover }))
import { GET } from "@/app/api/cron/lfa-materials-recovery/route"

describe("material recovery cron", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.auth.mockReturnValue(null)
    m.fixtures.mockResolvedValue([])
    m.supplemental.mockResolvedValue([])
    m.recover.mockResolvedValue({ attempted: 0, complete: 0, pending: 0, deferred: 0, errors: [] })
  })
  const run = () => GET(new NextRequest("http://localhost/api/cron/lfa-materials-recovery"))
  it("has its own execution start and never warms tomorrow before recovering", async () => {
    expect((await run()).status).toBe(200)
    expect(m.fixtures.mock.calls).toEqual([["2026-09-10"], ["2026-09-09"]])
    expect(m.recover).toHaveBeenCalledWith([], expect.any(Number))
    expect(m.warm).not.toHaveBeenCalled()
    expect(m.providerFixtures).not.toHaveBeenCalled()
    expect(m.supplemental).toHaveBeenCalledWith(
      "2026-09-08T21:00:00.000Z",
      "2026-09-10T21:00:00.000Z"
    )
  })
  it("includes saved LFA-only fixtures without any provider discovery or mapping", async () => {
    const saved = { gameId: "lfa-uuid", lfaMatchId: "lfa-1", source: "lfa" }
    const betman = { gameId: "betman-id" }
    m.supplemental.mockResolvedValue([{ fixture: saved }])
    m.fixtures.mockImplementation(async (day: string) => (day === "2026-09-10" ? [betman] : []))
    expect((await run()).status).toBe(200)
    expect(m.recover).toHaveBeenCalledWith([saved, betman], expect.any(Number))
    expect(m.providerFixtures).not.toHaveBeenCalled()
    expect(m.warm).not.toHaveBeenCalled()
  })
  it.each([{ pending: 1 }, { deferred: 1 }, { errors: [{ gameId: "a", reason: "save failed" }] }])(
    "incomplete recovery is not reported complete: %j",
    async (result) => {
      m.recover.mockResolvedValue({ pending: 0, deferred: 0, errors: [], ...result })
      expect((await run()).status).toBe(503)
    }
  )
})
