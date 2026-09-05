import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MotmOption } from "@/lib/motm/options"

const m = vi.hoisted(() => ({
  list: vi.fn(),
  siblings: vi.fn(),
  info: vi.fn(),
  lineup: vi.fn(),
  insert: vi.fn(),
  markets: [] as Record<string, unknown>[],
  polls: [] as Record<string, unknown>[],
}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/match/supplemental-fixtures", async (original) => ({
  ...(await original<typeof import("@/lib/match/supplemental-fixtures")>()),
  listSupplementalFixtures: m.list,
}))
vi.mock("@/lib/match/sibling-ids", () => ({ getSiblingGameIds: m.siblings }))
vi.mock("@/lib/match/get-lineup", () => ({ getMatchLineup: m.lineup }))
vi.mock("@/lib/lfa/match", () => ({ getLfaMatchInfo: m.info }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      let update = false
      let insert: Record<string, unknown> | null = null
      const run = () => {
        if (insert) {
          const old = m.polls.find((p) => p.match_key === insert!.match_key)
          if (old) return { data: null, error: { code: "23505" } }
          const row = { ...insert, id: "poll-1" }
          m.polls.push(row)
          m.insert(row)
          return { data: row, error: null }
        }
        return {
          data: table === "betman_games" ? m.markets : table === "polls" && !update ? m.polls : [],
          error: null,
        }
      }
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        gt: () => q,
        lte: () => q,
        lt: () => q,
        neq: () => q,
        not: () => q,
        update: () => {
          update = true
          return q
        },
        insert: (row: Record<string, unknown>) => {
          insert = row
          return q
        },
        single: () => q,
        then: <T>(resolve: (result: ReturnType<typeof run>) => T) =>
          Promise.resolve(run()).then(resolve),
      }
      return q
    },
  }),
}))
import { sweepMotmPolls } from "@/lib/motm/poll"

const side = (prefix: string) => ({
  teamLabel: prefix,
  starters: Array.from({ length: 11 }, (_, i) => ({
    label: `${prefix}${i}`,
    roman: `${prefix}${i}`,
    number: i + 1,
  })),
  bench: [
    { label: `${prefix}Sub`, roman: `${prefix}Sub`, number: 12 },
    { label: `${prefix}Unused`, roman: `${prefix}Unused`, number: 13 },
  ],
})
describe("LFA 컵경기 종료 → MOM 투표", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.markets = []
    m.polls = []
    const matchTime = new Date(Date.now() - 3 * 3600_000).toISOString()
    m.list.mockResolvedValue([
      {
        id: "fixture-uuid",
        lfa_match_id: "cup",
        betman_game_id: null,
        fixture: {
          lfaId: "cup",
          homeTeam: "맨시티",
          awayTeam: "하부리그",
          leagueCode: "잉글FA컵",
          matchTime,
          status: "completed",
          homeScore: 2,
          awayScore: 1,
        },
      },
    ])
    m.siblings.mockResolvedValue(["fixture-uuid"])
    m.info.mockResolvedValue({
      finished: true,
      homeScore: 2,
      awayScore: 1,
      timeline: [{ kind: "sub", side: "home", minute: "70", player: "Home0", inPlayer: "HomeSub" }],
    })
    m.lineup.mockResolvedValue({
      status: "ready",
      projected: false,
      home: side("Home"),
      away: side("Away"),
    })
  })
  it("LFA 종료 증거로 선발22명+실제 투입1명만 후보로 올린다", async () => {
    const result = await sweepMotmPolls()
    expect(result.created).toEqual([
      { matchKey: "lfa_cup", pollId: "poll-1", candidates: 23, ftSource: "lfa" },
    ])
    const options = m.polls[0].options as MotmOption[]
    expect(options.find((o) => o.label === "HomeSub")?.group).toBe("sub")
    expect(options.some((o) => o.label.includes("Unused") || o.label === "AwaySub")).toBe(false)
    expect(m.polls[0].game_id).toBe("fixture-uuid")
  })
  it("시간이 지나고 목록에 점수가 있어도 LFA가 진행 중이면 열지 않는다", async () => {
    m.info.mockResolvedValue({ finished: false, homeScore: 2, awayScore: 1, timeline: [] })
    expect((await sweepMotmPolls()).created).toHaveLength(0)
    expect(m.lineup).not.toHaveBeenCalled()
  })
  it("예상 라인업은 종료 뒤에도 투표 후보로 쓰지 않는다", async () => {
    m.lineup.mockResolvedValue({
      status: "ready",
      projected: true,
      home: side("Home"),
      away: side("Away"),
    })
    expect((await sweepMotmPolls()).created).toHaveLength(0)
  })
  it("재실행과 나중의 Betman 판매에도 기존 투표를 재사용한다", async () => {
    await sweepMotmPolls()
    m.markets = [
      {
        id: "later-market",
        home_team_name: "맨체스터 시티",
        away_team_name: "하부리그",
        league_code: "잉글FA컵",
        match_time: new Date(Date.now() - 3 * 3600_000).toISOString(),
        home_score: 2,
        away_score: 1,
      },
    ]
    m.siblings.mockResolvedValue(["fixture-uuid", "later-market"])
    expect((await sweepMotmPolls()).created).toHaveLength(0)
    expect(m.insert).toHaveBeenCalledTimes(1)
  })
})
