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
// 보류·원고 재시도 대상은 DB 원장에서 오는데, 이 시험은 신규 대상(일정 기반)만 본다.
// report-work 는 lib/supabase/server → lib/env 를 최상위에서 끌어와 시험 환경에서 죽는다.
vi.mock("@/lib/soccerway/report-work", () => ({ listReportRetryTargets: async () => [] }))
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

  it("LFA 전용 경기는 베트맨이 연결됐을 때만, 연결된 베트맨 id 로 부른다", async () => {
    // 유벤투스–AC밀란(2026-09-07): 이중 등록 뒤 일정이 source=lfa 로 바뀌어 리포트 대상에서 탈락했다
    const base = {
      homeTeam: "유벤투스",
      awayTeam: "AC밀란",
      leagueCode: "세리에A",
      matchTime: new Date(Date.now() - 3 * 3600_000).toISOString(),
      status: "completed",
      lfaFinished: true,
    }
    mocks.fixtures
      .mockResolvedValueOnce([
        { ...base, gameId: "lfa-uuid-linked", source: "lfa", betmanGameId: "betman-row" },
        { ...base, gameId: "lfa-uuid-only", source: "lfa", betmanGameId: null },
      ])
      .mockResolvedValueOnce([])
    const res = await GET(new NextRequest("http://localhost/api/cron/match-reports"))
    expect(res.status).toBe(200)
    expect(mocks.stored).toHaveBeenCalledExactlyOnceWith("betman-row")
    expect(mocks.extras).toHaveBeenCalledExactlyOnceWith("betman-row")
  })

  it("일정 조회 실패를 대상 경기 0건 성공으로 처리하지 않는다", async () => {
    mocks.fixtures
      .mockRejectedValueOnce(new Error("fixture DB unavailable"))
      .mockResolvedValueOnce([])
    const res = await GET(new NextRequest("http://localhost/api/cron/match-reports"))
    expect(res.status).toBe(500)
    expect(mocks.extras).not.toHaveBeenCalled()
  })
})
