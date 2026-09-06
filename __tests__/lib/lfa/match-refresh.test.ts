import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { lfaLeagueId } from "@/lib/lfa/leagues"
import type { LfaMatch } from "@/lib/lfa/client"

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  readDay: vi.fn(),
  readDetails: vi.fn(),
  writeDay: vi.fn(),
  writeDetails: vi.fn(),
  supplemental: vi.fn(),
  cacheEntries: new Map<string, unknown>(),
}))
vi.mock("react", () => ({ cache: (fn: unknown) => fn }))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, keys: string[]) => async () => {
    const key = keys.join("|")
    if (mocks.cacheEntries.has(key)) return mocks.cacheEntries.get(key)
    return fn()
  },
}))
vi.mock("@/lib/lfa/client", () => ({ lfaFetch: mocks.fetch }))
vi.mock("@/lib/lfa/persist", () => ({
  readDayMatches: mocks.readDay,
  readMatchDetails: mocks.readDetails,
  writeDayMatches: mocks.writeDay,
  writeMatchDetails: mocks.writeDetails,
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ data: [], neq: async () => ({ data: [] }) }),
    }),
  }),
}))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: async () => ({ status: "none" }),
}))
vi.mock("@/lib/match/resolve-team-id", () => ({ resolveTeamId: async () => null }))
vi.mock("@/lib/match/supplemental-fixtures", () => ({ getSupplementalFixture: mocks.supplemental }))
import { createLfaRefreshSession, getDayMatches, getLfaMatchInfo } from "@/lib/lfa/match"

const now = Date.parse("2026-09-04T20:00:00Z")
const game = {
  gameId: "game",
  homeTeam: "Chelsea",
  awayTeam: "Liverpool",
  leagueCode: "EPL",
  matchTime: "2026-09-04T19:00:00Z",
}
const match = (): LfaMatch => ({
  id: "lfa-1",
  league: { id: lfaLeagueId("EPL")!, name: "Premier League" },
  kickoff: "19:00",
  status: { status: "inGame", state: "inGame", display: "60", is_live: true },
  home: { id: "home", name: "Chelsea", score: "2" },
  away: { id: "away", name: "Liverpool", score: "1" },
})
const detail = (home = "1", away = "1", finished = false) => ({
  match_id: "lfa-1",
  events: [],
  stats: [],
  header: {
    home: { score: home },
    away: { score: away },
    status: {
      minute: "60",
      state: finished ? "postGame" : "inGame",
      display: finished ? "FT" : "60",
      is_live: !finished,
    },
  },
})

describe("LFA 실제 수집 시각과 실황 갱신", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(now)
    mocks.cacheEntries.clear()
    mocks.readDetails.mockResolvedValue(null)
    mocks.supplemental.mockResolvedValue(null)
    mocks.readDay.mockResolvedValue({ matches: [match()], updatedAt: now - 30_000, stale: false })
    mocks.fetch.mockResolvedValue(detail())
    mocks.writeDay.mockResolvedValue(undefined)
    mocks.writeDetails.mockImplementation(async (_id, info) => ({ written: true, info }))
  })
  afterEach(() => vi.restoreAllMocks())

  it("더 새로운 상세의 VAR 정정은 점수가 작아져도 반영한다", async () => {
    expect(await getLfaMatchInfo(game)).toMatchObject({ homeScore: 1, awayScore: 1 })
  })
  it("LFA 전용 경기는 번역 이름이 달라도 저장된 LFA ID로 스탯을 받는다", async () => {
    mocks.supplemental.mockResolvedValue({ lfa_match_id: "lfa-1" })
    mocks.fetch.mockResolvedValue({
      ...detail(),
      stats: [{ label: "Possession", home: "60%", away: "40%" }],
    })
    const info = await getLfaMatchInfo({ ...game, homeTeam: "미등록 홈", awayTeam: "미등록 원정" })
    expect(info).toMatchObject({ matchId: "lfa-1", live: true })
    expect(info?.stats).toHaveLength(1)
  })
  it("저장된 LFA ID가 없으면 이름이 비슷한 다른 경기로 바꾸지 않는다", async () => {
    mocks.supplemental.mockResolvedValue({ lfa_match_id: "different-id" })
    expect(await getLfaMatchInfo(game)).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it("오래된 상세가 더 새로운 목록의 골을 지우지 않는다", async () => {
    mocks.cacheEntries.set("lfa-details-v3|lfa-1|live|true", {
      details: detail("0", "0"),
      updatedAt: now - 60_000,
    })
    expect(await getLfaMatchInfo(game)).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      sourceUpdatedAt: now - 60_000,
    })
  })
  it("홈/원정 각각 최대값을 뽑아 가짜 점수 조합을 만들지 않는다", async () => {
    mocks.fetch.mockResolvedValue(detail("1", "2"))
    expect(await getLfaMatchInfo(game)).toMatchObject({ homeScore: 1, awayScore: 2 })
  })
  it("상세 FT가 목록보다 먼저 와도 종료를 반영한다", async () => {
    mocks.fetch.mockResolvedValue(detail("2", "1", true))
    expect(await getLfaMatchInfo(game)).toMatchObject({ finished: true, live: false })
  })
  it("목록이 아직 preGame이어도 킥오프가 지났으면 상세를 확인한다", async () => {
    const m = match()
    m.status = { status: "preGame", state: "preGame", display: "", is_live: false }
    mocks.readDay.mockResolvedValue({ matches: [m], updatedAt: now - 30_000, stale: false })
    expect(await getLfaMatchInfo(game)).toMatchObject({ live: true })
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", expect.anything())
  })
  it("같은 시각 1건이어도 팀명 증거가 없으면 붙이지 않는다", async () => {
    expect(
      await getLfaMatchInfo({ ...game, homeTeam: "사전없는홈", awayTeam: "사전없는원정" })
    ).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it("같은 슬롯의 원정 팀만 확실해도 상세의 LFA ID를 연결한다", async () => {
    expect(await getLfaMatchInfo({ ...game, homeTeam: "사전없는하부팀" })).toMatchObject({
      matchId: "lfa-1",
    })
  })
  it("양 팀이 맞아도 시각이 다른 경기로 폴백하지 않는다", async () => {
    const m = match()
    m.kickoff = "18:00"
    mocks.readDay.mockResolvedValue({ matches: [m], updatedAt: now - 30_000, stale: false })
    expect(await getLfaMatchInfo(game)).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it("같은 시각 한 팀이 맞아도 대회가 다르면 연결하지 않는다", async () => {
    const m = match()
    m.league.id = lfaLeagueId("잉글FA컵")!
    mocks.readDay.mockResolvedValue({ matches: [m], updatedAt: now - 30_000, stale: false })
    expect(await getLfaMatchInfo(game)).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it("SWR 캐시 재사용으로 DB 날짜 캐시의 수명을 연장하지 않는다", async () => {
    const old = { matches: [match()], updatedAt: now - 600_000, stale: true }
    mocks.readDay.mockResolvedValue(old)
    mocks.cacheEntries.set("lfa-day-v2|2026-09-04", old)
    expect(await getDayMatches("2026-09-04", true)).toEqual(old.matches)
    expect(mocks.writeDay).not.toHaveBeenCalled()
  })
  it("신규 적재에는 Data Cache 원본 수집 시각을 전달한다", async () => {
    mocks.readDay.mockResolvedValue(null)
    mocks.cacheEntries.set("lfa-day-v2|2026-09-04", { matches: [match()], updatedAt: now - 30_000 })
    await getDayMatches("2026-09-04", true)
    expect(mocks.writeDay).toHaveBeenCalledWith("2026-09-04", [match()], now - 30_000)
  })

  it("크론은 신선한 DB와 오래된 SWR 히트 모두 우회한다", async () => {
    const old = { matches: [match()], updatedAt: now - 900_000 }
    mocks.cacheEntries.set("lfa-day-v2|2026-09-04", old)
    mocks.cacheEntries.set("lfa-details-v3|lfa-1|live|true", {
      details: detail("0", "0"),
      updatedAt: now - 900_000,
    })
    mocks.readDetails.mockResolvedValue({ info: { finished: false, minute: "30" }, stale: false })
    mocks.fetch.mockImplementation(async (endpoint) =>
      endpoint === "matches" ? { matches: [match()] } : detail("3", "1")
    )
    const result = await createLfaRefreshSession()(game)
    expect(result).toMatchObject({
      status: "updated",
      info: { minute: "60", homeScore: 3, sourceUpdatedAt: now },
    })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.writeDay).toHaveBeenCalledWith("2026-09-04", [match()], now, { strict: true })
  })

  it("동시 형제 요청은 실행당 목록과 상세를 각각 한 번만 구매한다", async () => {
    mocks.fetch.mockImplementation(async (endpoint) =>
      endpoint === "matches" ? { matches: [match()] } : detail()
    )
    const refresh = createLfaRefreshSession()
    await Promise.all([refresh(game), refresh({ ...game, gameId: "sibling" })])
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    await createLfaRefreshSession()(game)
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
  })

  it("상세 실패를 목록만 있는 빈 상세로 덮어쓰지 않는다", async () => {
    mocks.fetch.mockImplementation(async (endpoint) =>
      endpoint === "matches" ? { matches: [match()] } : null
    )
    await expect(createLfaRefreshSession()(game)).rejects.toThrow("lfa-details-failed")
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("목록 실패 때 오래된 목록으로 갱신 성공을 주장하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(null)
    await expect(createLfaRefreshSession()(game)).rejects.toThrow("lfa-day-failed")
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("DB 저장 오류는 크론으로 전파한다", async () => {
    mocks.fetch.mockImplementation(async (endpoint) =>
      endpoint === "matches" ? { matches: [match()] } : detail()
    )
    mocks.writeDetails.mockRejectedValue(new Error("lfa-details-persist-failed"))
    await expect(createLfaRefreshSession()(game)).rejects.toThrow("lfa-details-persist-failed")
  })

  it("원자 저장이 거절한 오래된 요청은 DB 승자의 데이터를 반환한다", async () => {
    const winner = { finished: true, homeScore: 4, awayScore: 2 }
    mocks.writeDetails.mockResolvedValue({ written: false, info: winner })
    expect(await getLfaMatchInfo(game)).toEqual(winner)
  })

  it("완전한 종료 저장분은 크론도 재구매하지 않는다", async () => {
    mocks.readDetails.mockResolvedValue({ info: { finished: true }, stale: false })
    expect(await createLfaRefreshSession()(game)).toMatchObject({ status: "settled" })
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })
})
