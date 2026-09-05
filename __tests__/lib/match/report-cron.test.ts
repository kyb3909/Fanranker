import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({
  fixtures: vi.fn(),
  extras: vi.fn(),
  stored: vi.fn(),
  record: vi.fn(),
}))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, fn: unknown) => fn }))
vi.mock("@/lib/api-error", () => ({ apiError: () => new Response(null, { status: 500 }) }))
vi.mock("@/lib/match/get-fixtures", () => ({
  todayKst: () => "2026-09-05",
  getFixturesForDay: mocks.fixtures,
}))
vi.mock("@/lib/soccerway/match-extras", () => ({
  getMatchExtras: mocks.extras,
  hasStoredReport: mocks.stored,
}))
vi.mock("@/lib/soccerway/report-attempts", () => ({ recordReportAttempt: mocks.record }))
import { GET } from "@/app/api/cron/match-reports/route"

describe("리포트 크론 대상·실패 판정", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stored.mockResolvedValue(false)
    mocks.extras.mockResolvedValue({ stats: null, report: null })
  })
  it("LFA FT + extras 리그만 호출하며 null에서 매핑 실패를 추측하지 않는다", async () => {
    const base = {
      homeTeam: "첼시",
      awayTeam: "리버풀",
      matchTime: new Date(Date.now() - 3 * 3600_000).toISOString(),
      status: "completed",
      lfaFinished: true,
    }
    mocks.fixtures
      .mockResolvedValueOnce([
        { ...base, gameId: "allowed", leagueCode: "EPL" },
        { ...base, gameId: "cup", leagueCode: "잉글FA컵" },
        { ...base, gameId: "betman-only", leagueCode: "EPL", lfaFinished: undefined },
        { ...base, gameId: null, leagueCode: "EPL" },
      ])
      .mockResolvedValueOnce([])
    const res = await GET(new NextRequest("http://localhost/api/cron/match-reports"))
    expect(res.status).toBe(200)
    expect(mocks.extras).toHaveBeenCalledExactlyOnceWith("allowed")
    expect(mocks.record).not.toHaveBeenCalled()
  })
})
