import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ fixtures: vi.fn(), refresh: vi.fn(), read: vi.fn() }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_job: string, handler: unknown) => handler }))
vi.mock("@/lib/lfa/match", () => ({ createLfaRefreshSession: () => mocks.refresh }))
vi.mock("@/lib/lfa/persist", () => ({ readMatchDetails: mocks.read }))
vi.mock("@/lib/match/get-fixtures", () => ({
  getFixturesForDay: mocks.fixtures,
  todayKst: () => "2026-09-13",
}))
import { GET } from "@/app/api/cron/lfa-live/route"

const now = Date.parse("2026-09-12T20:00:00Z")
const fixture = {
  gameId: "known-game",
  homeTeam: "선덜랜드",
  awayTeam: "아스널",
  leagueCode: "EPL",
  matchTime: "2026-09-12T19:00:00Z",
  status: "in_progress",
}
const info = (sourceUpdatedAt = now - 30_000) => ({
  matchId: "provider-id",
  sourceUpdatedAt,
  finished: false,
  live: true,
  minute: "60",
  homeScore: 0,
  awayScore: 1,
  stats: [],
  timeline: [],
})
const request = () => new NextRequest("http://localhost/api/cron/lfa-live")

describe("lfa-live reports the freshness of the actual persisted winner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(now)
    mocks.fixtures.mockResolvedValue([fixture])
    mocks.read.mockResolvedValue(null)
  })
  afterEach(() => vi.restoreAllMocks())

  it("does not turn an old superseded snapshot into a successful heartbeat", async () => {
    mocks.refresh.mockResolvedValue({ status: "superseded", info: info(now - 18 * 60_000) })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      results: [],
      errors: [{ gameId: "known-game", reason: "lfa-refresh-stale" }],
      deferred: 0,
    })
  })
  it("keeps a concurrent newer winner successful", async () => {
    mocks.refresh.mockResolvedValue({ status: "superseded", info: info() })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ results: [{ status: "superseded" }], errors: [] })
  })
  it("keeps an old but complete FT winner successful", async () => {
    mocks.refresh.mockResolvedValue({
      status: "superseded",
      info: {
        ...info(now - 60 * 60_000),
        finished: true,
        live: false,
        timeline: [{ minute: "45", kind: "yellow", side: "home", player: "선수" }],
      },
    })
    expect((await GET(request())).status).toBe(200)
  })
  it("does not claim an unfinished snapshot without source time is fresh", async () => {
    mocks.refresh.mockResolvedValue({
      status: "updated",
      info: { ...info(), sourceUpdatedAt: undefined },
    })
    expect((await GET(request())).status).toBe(503)
  })
  it("does not indefinitely accept an old FT snapshot with missing details", async () => {
    mocks.refresh.mockResolvedValue({
      status: "superseded",
      info: {
        ...info(now - 11 * 60_000),
        finished: true,
        live: false,
      },
    })
    expect((await GET(request())).status).toBe(503)
  })
  it("uses the existing live freshness boundary without flagging the boundary itself", async () => {
    mocks.refresh.mockResolvedValue({ status: "updated", info: info(now - 120_000) })
    expect((await GET(request())).status).toBe(200)
    mocks.refresh.mockResolvedValue({ status: "updated", info: info(now - 120_001) })
    expect((await GET(request())).status).toBe(503)
  })
})
