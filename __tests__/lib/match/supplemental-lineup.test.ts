import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  summary: vi.fn(),
  lineup: vi.fn(),
  soccerway: vi.fn(),
  store: vi.fn(),
  resolve: vi.fn(),
  stored: null as unknown,
}))
vi.mock("@/lib/match/get-match", () => ({ getMatchByGameId: m.summary }))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: async () => ["fixture-uuid"] }))
vi.mock("@/lib/lfa/match", () => ({ resolveLfaMatch: m.resolve }))
vi.mock("@/lib/lfa/persist", () => ({ readMatchDetails: async () => null }))
vi.mock("@/lib/lfa/lineups", () => ({
  getLfaLineup: m.lineup,
  getTeamSquadNames: async () => [],
  localizePlayerName: (s: string) => s,
}))
vi.mock("@/lib/soccerway/lineup-lookup", () => ({
  getLineupForGame: m.soccerway,
}))
vi.mock("@/lib/match/lineup-store", () => ({
  storeLfaLineup: m.store,
  loadStoredLineup: async () => m.stored,
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: m.stored
            ? [
                {
                  game_id: "fixture-uuid",
                  event_id: "lfa-cup",
                  payload: m.stored,
                  updated_at: new Date().toISOString(),
                },
              ]
            : [],
        }),
      }),
    }),
  }),
}))
import { getMatchLineup } from "@/lib/match/get-lineup"

describe("LFA 전용 경기 라인업", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-05T17:30:00Z"))
    vi.clearAllMocks()
    m.stored = null
    m.store.mockResolvedValue(undefined)
    m.resolve.mockResolvedValue({ id: "lfa-betman" })
    m.summary.mockResolvedValue({
      source: "lfa",
      lfaMatchId: "lfa-cup",
      gameId: "fixture-uuid",
      homeTeam: "맨시티",
      awayTeam: "하부리그",
      matchTime: "2026-09-05T18:00:00Z",
    })
    m.lineup.mockResolvedValue({
      projected: false,
      home: { starters: Array(11).fill({}), bench: [] },
      away: { starters: Array(11).fill({}), bench: [] },
    })
  })
  afterEach(() => vi.useRealTimers())
  it("베트맨/Soccerway 없이 LFA ID로 받아 같은 저장소에 저장한다", async () => {
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({
      status: "ready",
      projected: false,
    })
    expect(m.lineup).toHaveBeenCalledWith("lfa-cup", "맨시티", "하부리그")
    expect(m.store).toHaveBeenCalledWith(
      "fixture-uuid",
      "lfa-cup",
      expect.objectContaining({ status: "ready" })
    )
    expect(m.soccerway).not.toHaveBeenCalled()
  })
  it("예상 라인업도 저장하되 예상 플래그를 유지한다", async () => {
    m.lineup.mockResolvedValue({
      projected: true,
      home: { starters: Array(11).fill({}), bench: [] },
      away: { starters: Array(11).fill({}), bench: [] },
    })
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "ready", projected: true })
    expect(m.store).toHaveBeenCalledWith(
      "fixture-uuid",
      "lfa-cup",
      expect.objectContaining({ projected: true })
    )
  })
  it("미발표·일시 실패는 pending으로 재시도를 허용한다", async () => {
    m.lineup.mockResolvedValue(null)
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "pending" })
    m.lineup.mockRejectedValue(new Error("timeout"))
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "pending" })
  })
  it("베트맨 경기도 Soccerway가 아니라 대회·시각·팀으로 해석한 LFA ID만 사용한다", async () => {
    m.summary.mockResolvedValue({
      gameId: "market",
      homeTeam: "Roma",
      awayTeam: "Atalanta",
      leagueCode: "세리에A",
      matchTime: new Date().toISOString(),
    })
    expect(await getMatchLineup("market")).toMatchObject({
      status: "ready",
      source: "lfa",
      matchId: "lfa-betman",
    })
    expect(m.resolve).toHaveBeenCalled()
    expect(m.lineup).toHaveBeenCalledWith("lfa-betman", "Roma", "Atalanta")
    expect(m.soccerway).not.toHaveBeenCalled()
    m.resolve.mockResolvedValue(null)
    expect(await getMatchLineup("market")).toMatchObject({ status: "pending" })
    expect(m.soccerway).not.toHaveBeenCalled()
  })
  it("확정 저장분은 피드 없이도 다시 읽힌다", async () => {
    m.stored = {
      status: "ready",
      projected: false,
      source: "lfa",
      home: { teamLabel: "맨시티", starters: Array(11).fill({}), bench: [{}] },
      away: { teamLabel: "하부리그", starters: Array(11).fill({}), bench: [{}] },
    }
    expect(await getMatchLineup("fixture-uuid")).toBe(m.stored)
    expect(m.lineup).not.toHaveBeenCalled()
    expect(m.summary).not.toHaveBeenCalled()
    expect(m.resolve).not.toHaveBeenCalled()
  })
  it("벤치가 비어 있는 확정 명단도 재방문 때 재구매하지 않는다", async () => {
    m.store.mockImplementation(async (_gameId, _matchId, payload) => {
      m.stored = payload
    })
    const first = await getMatchLineup("fixture-uuid")
    const second = await getMatchLineup("fixture-uuid")
    expect(second).toEqual(first)
    expect(m.lineup).toHaveBeenCalledTimes(1)
    expect(m.summary).toHaveBeenCalledTimes(1)
  })
  it("과거 저장분은 원본 일정이 없어져도 공급자·명단을 바꾸지 않는다", async () => {
    m.stored = {
      status: "ready",
      projected: false,
      home: { starters: [], bench: [] },
      away: { starters: [], bench: [] },
    }
    m.summary.mockResolvedValue(null)
    expect(await getMatchLineup("archived-game")).toBe(m.stored)
    expect(m.summary).not.toHaveBeenCalled()
    expect(m.lineup).not.toHaveBeenCalled()
    expect(m.soccerway).not.toHaveBeenCalled()
  })
  it("저장한 예상 명단은 120초 재사용하고 이후 확정 명단으로 한 번 교체한다", async () => {
    m.store.mockImplementation(async (_gameId, _matchId, payload) => {
      m.stored = payload
    })
    m.lineup.mockResolvedValueOnce({
      projected: true,
      home: { starters: Array(11).fill({}), bench: [] },
      away: { starters: Array(11).fill({}), bench: [] },
    })
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ projected: true })
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ projected: true })
    expect(m.lineup).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 121_000)
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ projected: false })
    vi.setSystemTime(Date.now() + 3600_000)
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ projected: false })
    expect(m.lineup).toHaveBeenCalledTimes(2)
  })
  it("예상 갱신 실패 시에도 기존 명단을 지우지 않는다", async () => {
    m.stored = {
      status: "ready",
      projected: true,
      fetchedAt: new Date(Date.now() - 180_000).toISOString(),
    }
    m.lineup.mockResolvedValue(null)
    expect(await getMatchLineup("fixture-uuid")).toBe(m.stored)
  })
  it("한쪽 선발이 빠진 명단은 ready로 표시하거나 저장하지 않는다", async () => {
    m.lineup.mockResolvedValue({
      projected: false,
      home: { starters: [{}], bench: [] },
      away: { starters: Array(11).fill({}), bench: [] },
    })
    expect(await getMatchLineup("fixture-uuid")).toMatchObject({ status: "pending" })
    expect(m.store).not.toHaveBeenCalled()
  })
})
