import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fixtures: vi.fn(),
  lineup: vi.fn(),
  siblings: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  postError: null as null | { message: string },
  existing: [] as { id: string }[],
  inIds: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
vi.mock("@/lib/match/get-fixtures", () => ({
  getFixturesForDay: mocks.fixtures,
  MATCHDAY_START_HOUR_KST: 6,
}))
vi.mock("@/lib/match/get-lineup", () => ({ getMatchLineup: mocks.lineup }))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: mocks.siblings }))
vi.mock("@/lib/match/team-display", () => ({
  loadTeamShortMap: async () => new Map(),
  displayTeamName: (s: string) => s,
}))
import { sweepMatchThreads } from "@/lib/match/thread"

describe("불판 생성", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existing = []
    mocks.postError = null
    mocks.fixtures.mockResolvedValue([
      {
        gameId: "market-z",
        matchKey: "fixture",
        homeTeam: "리버풀",
        awayTeam: "첼시",
        leagueCode: "EPL",
        matchTime: new Date().toISOString(),
        status: "in_progress",
      },
    ])
    mocks.siblings.mockResolvedValue(["market-z", "market-a"])
    mocks.lineup.mockResolvedValue({ status: "ready", projected: false })
    mocks.insert.mockReturnValue({
      select: () => ({ single: async () => ({ data: { id: "post-1" }, error: null }) }),
    })
    mocks.from.mockImplementation(() => ({
      insert: mocks.insert,
      select: () => ({
        in: (key: string, ids: string[]) => {
          mocks.inIds(key, ids)
          return { limit: async () => ({ data: mocks.existing, error: mocks.postError }) }
        },
      }),
    }))
  })
  it("형제 전체에서 조회하고 정렬된 대표 ID에 생성한다", async () => {
    const result = await sweepMatchThreads()
    expect(result.created).toHaveLength(1)
    expect(mocks.inIds).toHaveBeenCalledWith("match_game_id", ["market-z", "market-a"])
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ match_game_id: "market-a" })
    )
    expect(mocks.siblings).toHaveBeenCalledWith(expect.anything(), "market-z", { strict: true })
  })
  it("예상 ready는 불판을 만들지 않는다", async () => {
    mocks.lineup.mockResolvedValue({ status: "ready", projected: true })
    expect((await sweepMatchThreads()).created).toHaveLength(0)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("LFA 전용 경기에도 같은 불판을 만들고 늦은 Betman ID보다 기존 ID를 유지한다", async () => {
    mocks.fixtures.mockResolvedValue([
      {
        gameId: "lfa-uuid",
        source: "lfa",
        matchKey: "lfa_cup",
        homeTeam: "맨시티",
        awayTeam: "하부리그",
        leagueCode: "잉글FA컵",
        matchTime: new Date().toISOString(),
        status: "scheduled",
      },
    ])
    mocks.siblings.mockResolvedValue(["lfa-uuid", "a-later-market"])
    expect((await sweepMatchThreads()).created).toHaveLength(1)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ match_game_id: "lfa-uuid" })
    )
    expect(mocks.lineup).toHaveBeenCalledWith("lfa-uuid")
  })
  it("형제에 기존 글이 있으면 중복 생성하지 않는다", async () => {
    mocks.existing = [{ id: "old-post" }]
    await sweepMatchThreads()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("기존 글 조회 실패는 삽입 허가가 아니다", async () => {
    mocks.postError = { message: "unavailable" }
    await sweepMatchThreads()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("형제 조회 실패도 삽입 허가가 아니다", async () => {
    mocks.siblings.mockRejectedValue(new Error("unavailable"))
    await sweepMatchThreads()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
