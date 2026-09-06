import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ fixtures: vi.fn(), refresh: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: mocks.auth }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/lfa/match", () => ({
  createLfaRefreshSession: () => mocks.refresh,
  getLfaDayIndex: async () => new Map(),
}))
vi.mock("@/lib/match/get-fixtures", () => ({
  getFixturesForDay: mocks.fixtures,
  todayKst: () => "2026-09-07",
}))
import { GET } from "@/app/api/cron/lfa-warm/route"

const now = Date.parse("2026-09-06T21:10:00Z")
const fixture = (elapsedHours: number) => ({
  gameId: `game-${elapsedHours}`,
  homeTeam: "Chelsea",
  awayTeam: "Liverpool",
  leagueCode: "EPL",
  matchTime: new Date(now - elapsedHours * 3600_000).toISOString(),
  status: "completed",
})
const request = () => new NextRequest("http://localhost/api/cron/lfa-warm")

describe("lfa-warm handoff to live cron", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(now)
    mocks.auth.mockReturnValue(null)
    mocks.fixtures.mockResolvedValue([])
    mocks.refresh.mockResolvedValue({ info: { stats: [1] } })
  })
  afterEach(() => vi.restoreAllMocks())
  it("실황 +4h까지는 새 크론에 맡기고 이전 매치데이 +4~6h를 보충한다", async () => {
    mocks.fixtures.mockImplementation(async (day) =>
      day === "2026-09-06" ? [fixture(2), fixture(4), fixture(5), fixture(7)] : []
    )
    expect((await GET(request())).status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledWith(expect.objectContaining({ gameId: "game-5" }))
  })
  it("상세 저장 실패를 성공으로 숨기지 않는다", async () => {
    mocks.fixtures.mockImplementation(async (day) => (day === "2026-09-06" ? [fixture(5)] : []))
    mocks.refresh.mockRejectedValue(new Error("lfa-details-persist-failed"))
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ details: { errors: ["game-5"] } })
  })
})
