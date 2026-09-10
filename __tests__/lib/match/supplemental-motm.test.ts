import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MotmOption } from "@/lib/motm/options"

const m = vi.hoisted(() => ({
  list: vi.fn(),
  siblings: vi.fn(),
  info: vi.fn(),
  lineup: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  markets: [] as Record<string, unknown>[],
  polls: [] as Record<string, unknown>[],
  failPollRead: false,
  storedInfo: {} as Record<string, unknown>,
  storedLineup: {} as Record<string, unknown>,
  extraLineups: [] as Record<string, unknown>[],
}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/match/supplemental-fixtures", async (original) => ({
  ...(await original<typeof import("@/lib/match/supplemental-fixtures")>()),
  listSupplementalFixtures: m.list,
}))
vi.mock("@/lib/match/sibling-ids", () => ({
  getSiblingGameIds: m.siblings,
  getMatchIdentity: async () => ({
    gameIds: await m.siblings(),
    lfaMatchId: "cup",
    pollKeys: ["lfa_cup"],
  }),
}))
vi.mock("@/lib/match/get-lineup", () => ({ getMatchLineup: m.lineup }))
vi.mock("@/lib/lfa/match", () => ({ getLfaMatchInfo: m.info }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    rpc: m.rpc,
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
          data:
            table === "betman_games"
              ? m.markets
              : table === "polls" && !update
                ? m.polls
                : table === "match_details_cache"
                  ? [
                      {
                        game_id: "fixture-uuid",
                        finished: m.storedInfo.finished,
                        payload: m.storedInfo,
                      },
                    ]
                  : table === "match_lineups"
                    ? [
                        { payload: m.storedLineup },
                        ...m.extraLineups.map((payload) => ({ payload })),
                      ]
                    : [],
          error: table === "polls" && !update && m.failPollRead ? { message: "read failed" } : null,
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
        order: () => q,
        limit: () => q,
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
    m.failPollRead = false
    m.extraLineups = []
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
    m.storedInfo = {
      finished: true,
      homeScore: 2,
      awayScore: 1,
      timeline: [{ kind: "sub", side: "home", minute: "70", player: "Home0", inPlayer: "HomeSub" }],
    }
    m.info.mockResolvedValue(m.storedInfo)
    m.storedLineup = {
      status: "ready",
      projected: false,
      source: "lfa",
      matchId: "cup",
      home: side("Home"),
      away: side("Away"),
    }
    m.lineup.mockResolvedValue(m.storedLineup)
    m.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "append_motm_options") {
        const poll = m.polls.find((p) => p.id === args.p_poll_id)!
        const existing = (poll.options ?? []) as MotmOption[]
        const added = (args.p_options as MotmOption[]).filter(
          (o) => !existing.some((e) => e.key === o.key)
        )
        poll.options = [...existing, ...added]
        return { data: { added: added.length, options: poll.options }, error: null }
      }
      const row = {
        id: "poll-1",
        game_id: args.p_game_id,
        match_key: args.p_match_key,
        options: args.p_options,
        is_active: true,
      }
      m.polls.push(row)
      m.insert(row)
      return { data: { id: row.id, created: true }, error: null }
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
    m.storedInfo = { finished: false, homeScore: 2, awayScore: 1, timeline: [] }
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
  it("LFA 전용 목록 조회가 실패해도 베트맨 경기 폴은 만들고 장애를 결과에 싣는다", async () => {
    // 2026-09-06 01:00~01:30 실사고: lfa_fixtures 테이블 부재 → 스윕 전체 500 → 12경기 MoTM 46분 지연
    m.list.mockRejectedValue(new Error("lfa-fixture-list:42P01"))
    m.markets = [
      {
        id: "betman-market",
        home_team_name: "첼시",
        away_team_name: "리버풀",
        league_code: "EPL",
        match_time: new Date(Date.now() - 3 * 3600_000).toISOString(),
        status: "completed",
        home_score: 2,
        away_score: 1,
      },
    ]
    const result = await sweepMotmPolls()
    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({ ftSource: "betman" })
    expect(result.errors).toEqual([{ scope: "lfa_fixtures", message: "lfa-fixture-list:42P01" }])
  })
  it("장애가 없으면 errors 는 빈 배열이다", async () => {
    expect((await sweepMotmPolls()).errors).toEqual([])
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
  it("매핑 복구 전에 베트맨 ID로 생성된 투표도 재사용한다", async () => {
    m.siblings.mockResolvedValue(["fixture-uuid", "old-market"])
    m.polls = [
      {
        id: "existing",
        game_id: "old-market",
        match_key: "old-betman-key",
        is_active: false,
        options: [],
      },
    ]
    expect((await sweepMotmPolls()).created).toHaveLength(0)
    expect(m.insert).not.toHaveBeenCalled()
  })
  it("기존 투표 조회가 실패하면 새 투표를 만들지 않고 다음 회차에 재시도한다", async () => {
    m.failPollRead = true
    expect((await sweepMotmPolls()).errors).toContainEqual({
      scope: "existing_polls",
      message: "read failed",
    })
    expect(m.insert).not.toHaveBeenCalled()
    m.failPollRead = false
    expect((await sweepMotmPolls()).created).toHaveLength(1)
  })
  it("이미 교체 선수가 있어도 DB 자료로 누락 후보를 추가하고 공급자를 부르지 않는다", async () => {
    m.polls = [
      {
        id: "existing",
        game_id: "fixture-uuid",
        match_key: "lfa_cup",
        is_active: true,
        options: [{ key: "old-voted-key", label: "기존 선수", group: "sub" }],
      },
    ]
    const result = await sweepMotmPolls()
    expect(result.repaired[0].added).toBeGreaterThan(0)
    expect(m.polls[0].options).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "old-voted-key" })])
    )
    expect(m.lineup).not.toHaveBeenCalled()
    expect(m.info).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalledWith("append_motm_options", expect.anything())
  })
  it("검증된 LFA 번호가 없는 명단으로는 생성하지 않는다", async () => {
    m.lineup.mockResolvedValue({ ...m.storedLineup, source: undefined })
    expect((await sweepMotmPolls()).created).toHaveLength(0)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it("더 풍부한 예상/다른 경기 명단보다 같은 경기 확정 명단을 보강에 쓴다", async () => {
    m.polls = [
      {
        id: "existing",
        game_id: "fixture-uuid",
        match_key: "lfa_cup",
        is_active: true,
        options: [],
      },
    ]
    const richer = {
      ...side("Wrong"),
      bench: Array.from({ length: 20 }, (_, i) => ({
        label: `Wrong${i}`,
        roman: `Wrong${i}`,
        number: 20 + i,
        subIn: "60",
      })),
    }
    m.extraLineups = [
      { ...m.storedLineup, projected: true, home: richer },
      { ...m.storedLineup, matchId: "different", home: richer },
    ]
    const result = await sweepMotmPolls()
    expect(result.repaired[0].added).toBe(23)
    expect((m.polls[0].options as MotmOption[]).some((o) => o.label.startsWith("Wrong"))).toBe(
      false
    )
    expect(m.info).not.toHaveBeenCalled()
  })
})
