import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  games: [] as unknown[],
  details: [] as unknown[],
  statuses: vi.fn(),
}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({ from: mocks.from }) }))
vi.mock("@/lib/match/team-display", () => ({ stripNationalSuffix: (s: string) => s }))
import { getLiveFinishedForToday } from "@/lib/betman/games-payload"

describe("홈 밴드의 LFA 상태", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.games = ["a", "b"].map((id) => ({
      id,
      home_team_name: "첼시",
      away_team_name: "리버풀",
      league_code: "EPL",
      match_time: new Date(Date.now() - 3600_000).toISOString(),
      status: "scheduled",
      home_score: null,
      away_score: null,
    }))
    mocks.details = []
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        lte: () => query,
        neq: () => query,
        not: () => query,
        in: (column: string, values: unknown[]) => {
          if (column === "status") mocks.statuses(values)
          return query
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: table === "betman_games" ? mocks.games : mocks.details }).then(
            resolve
          ),
      }
      return query
    })
  })
  it("betman scheduled라도 형제 LFA가 live면 LIVE로 보인다", async () => {
    mocks.details = [
      {
        game_id: "b",
        finished: false,
        payload: { live: true, homeScore: 1, awayScore: 0 },
        updated_at: new Date().toISOString(),
      },
    ]
    const result = await getLiveFinishedForToday()
    expect(mocks.statuses).toHaveBeenCalledWith(expect.arrayContaining(["scheduled"]))
    expect(result.liveMatches).toHaveLength(1)
    expect(result.liveMatches[0]).toMatchObject({
      status: "in_progress",
      homeScore: 1,
      awayScore: 0,
    })
  })
  it("형제 LFA의 finished가 betman 상태와 무관하게 FT를 연다", async () => {
    mocks.details = [
      {
        game_id: "b",
        finished: true,
        payload: { live: false, homeScore: 2, awayScore: 1 },
        updated_at: new Date().toISOString(),
      },
    ]
    expect((await getLiveFinishedForToday()).finishedMatches).toHaveLength(1)
  })
  it("LFA 증거가 없으면 betman 정산 완료만으로 FT를 붙이지 않는다", async () => {
    mocks.games = (mocks.games as Record<string, unknown>[]).map((g) => ({
      ...g,
      status: "completed",
      home_score: 2,
      away_score: 0,
    }))
    expect(await getLiveFinishedForToday()).toEqual({ liveMatches: [], finishedMatches: [] })
  })
})
