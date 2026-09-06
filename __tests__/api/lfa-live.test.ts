import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  fixtures: vi.fn(),
  refresh: vi.fn(),
  read: vi.fn(),
  auth: vi.fn(),
}))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: mocks.auth }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/lfa/match", () => ({ createLfaRefreshSession: () => mocks.refresh }))
vi.mock("@/lib/lfa/persist", () => ({ readMatchDetails: mocks.read }))
vi.mock("@/lib/match/get-fixtures", () => ({
  getFixturesForDay: mocks.fixtures,
  todayKst: () => "2026-09-07",
}))
import { GET } from "@/app/api/cron/lfa-live/route"

const now = Date.parse("2026-09-06T21:10:00Z") // KST 06:10, 직전 매치데이 꼬리
const fixture = (gameId = "g") => ({
  gameId,
  homeTeam: "Chelsea",
  awayTeam: "Liverpool",
  leagueCode: "EPL",
  matchTime: "2026-09-06T19:00:00Z",
  status: "in_progress",
})
const request = () => new NextRequest("http://localhost/api/cron/lfa-live")

describe("lfa-live cron", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(now)
    mocks.auth.mockReturnValue(null)
    mocks.fixtures.mockResolvedValue([])
    mocks.read.mockResolvedValue(null)
    mocks.refresh.mockResolvedValue({ status: "updated", info: { sourceUpdatedAt: now } })
  })
  afterEach(() => vi.restoreAllMocks())

  it("인증 실패면 수집하지 않는다", async () => {
    mocks.auth.mockReturnValue(new Response(null, { status: 401 }))
    expect((await GET(request())).status).toBe(401)
    expect(mocks.fixtures).not.toHaveBeenCalled()
  })
  it("진행 대상이 없으면 상세 구매가 없다", async () => {
    expect((await GET(request())).status).toBe(200)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it("이전 매치데이/LFA 전용 경기와 형제 중복을 처리한다", async () => {
    mocks.fixtures.mockImplementation(async (day) =>
      day === "2026-09-06"
        ? [
            fixture(),
            { ...fixture("sibling") },
            { ...fixture("lfa-only"), homeTeam: "Arsenal", source: "lfa" },
          ]
        : []
    )
    const result = await (await GET(request())).json()
    expect(result.targets).toBe(2)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    expect(mocks.refresh).toHaveBeenCalledWith(expect.objectContaining({ gameId: "lfa-only" }))
  })
  it("시작 전/취소/창 밖/비대상 리그는 사지 않는다", async () => {
    mocks.fixtures.mockResolvedValue([
      { ...fixture(), matchTime: "2026-09-06T23:00:00Z" },
      { ...fixture(), matchTime: "2026-09-06T10:00:00Z" },
      { ...fixture(), status: "cancelled" },
      { ...fixture(), leagueCode: "unknown" },
    ])
    expect((await GET(request())).status).toBe(200)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it("완전한 LFA 종료 저장분은 제외하되 Betman completed만으로 제외하지 않는다", async () => {
    mocks.fixtures.mockResolvedValue([{ ...fixture(), status: "completed" }])
    await GET(request())
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    mocks.refresh.mockClear()
    mocks.read.mockResolvedValue({ info: { finished: true }, stale: false })
    await GET(request())
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it("한 경기 실패가 다른 경기를 막지 않고 부분 실패를 노출한다", async () => {
    mocks.fixtures.mockResolvedValue([fixture(), { ...fixture("other"), homeTeam: "Arsenal" }])
    mocks.refresh.mockImplementation(async (f) => {
      if (f.gameId === "g") throw new Error("lfa-details-failed")
      return { status: "updated", info: { sourceUpdatedAt: now } }
    })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      errors: [{ gameId: "g", reason: "lfa-details-failed" }],
      results: [{ gameId: "other" }],
      deferred: 0,
    })
  })
  it("24개 예산은 오래된 저장분부터 쓰고 나머지는 명시한다", async () => {
    mocks.fixtures.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ ...fixture(String(i)), homeTeam: `Home ${i}` }))
    )
    mocks.read.mockImplementation(async (id) => ({
      info: { finished: false },
      updatedAt: 1000 - Number(id),
    }))
    const response = await GET(request())
    expect(await response.json()).toMatchObject({ targets: 25, deferred: 1 })
    expect(mocks.refresh.mock.calls[0][0].gameId).toBe("24")
    expect(mocks.refresh.mock.calls.some(([f]) => f.gameId === "0")).toBe(false)
  })
})
