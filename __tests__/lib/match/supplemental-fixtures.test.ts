import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LfaFixture } from "@/lib/lfa/fixtures"

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  fail: "",
  writes: [] as string[],
  fixtures: vi.fn(),
  dictionary: vi.fn(),
  members: vi.fn(),
  cachedBetman: null as unknown[] | null,
}))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, keys: string[]) => () =>
    keys?.[0] === "fixtures-day" && state.cachedBetman !== null ? state.cachedBetman : fn(),
}))
vi.mock("@/lib/lfa/fixtures", () => ({ getLfaFixturesForMatchday: state.fixtures }))
vi.mock("@/lib/lfa/match", () => ({
  cachedTeamEn: state.dictionary,
  // 팀 번호 색인은 이 시험의 관심사가 아니다 — 비워 두면 이름 대조만 돈다 (종전 동작)
  cachedTeamLfaIds: async () => [] as [string, string][],
}))
vi.mock("@/lib/lfa/league-members", () => ({ getBetmanLeagueMembers: state.members }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      type Row = Record<string, unknown>
      const filters: ((r: Row) => boolean)[] = []
      let pending: Row[] | undefined
      let single = false
      let limit = Infinity
      const run = () => {
        if (state.fail === table) {
          return { data: null, error: { code: "unavailable", message: "connection failed" } }
        }
        const rows = (state.tables[table] ??= [])
        if (pending) {
          state.writes.push(table)
          const saved = pending.map((r) => {
            let old = rows.find((v) => v.lfa_match_id === r.lfa_match_id)
            if (!old) {
              old = {
                id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
                betman_game_id: null,
              }
              rows.push(old)
            }
            Object.assign(old, r)
            return old
          })
          return { data: saved, error: null }
        }
        const found = rows.filter((r) => filters.every((f) => f(r))).slice(0, limit)
        return { data: single ? (found[0] ?? null) : found, error: null }
      }
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push((r) => r[k] === v)
          return q
        },
        neq: (k: string, v: unknown) => {
          filters.push((r) => r[k] !== v)
          return q
        },
        in: (k: string, v: unknown[]) => {
          filters.push((r) => v.includes(r[k]))
          return q
        },
        gte: (k: string, v: string) => {
          filters.push((r) => String(r[k]) >= v)
          return q
        },
        lt: (k: string, v: string) => {
          filters.push((r) => String(r[k]) < v)
          return q
        },
        not: (k: string) => {
          filters.push((r) => r[k] != null)
          return q
        },
        maybeSingle: () => {
          single = true
          return q
        },
        limit: (count: number) => {
          limit = count
          return q
        },
        upsert: (rows: Row[]) => {
          pending = rows
          return q
        },
        then: <T>(resolve: (result: ReturnType<typeof run>) => T) =>
          Promise.resolve(run()).then(resolve),
      }
      return q
    },
  }),
}))

import { syncSupplementalFixtures, supplementalSummary } from "@/lib/match/supplemental-fixtures"
import { getFixturesForDay } from "@/lib/match/get-fixtures"
import { getMatchByGameId } from "@/lib/match/get-match"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { createServiceRoleClient } from "@/lib/supabase/server"

const fixture = (overrides: Partial<LfaFixture> = {}): LfaFixture => ({
  lfaId: "cup-city-minnow",
  leagueCode: "잉글FA컵",
  homeTeam: "맨체스터 시티",
  awayTeam: "Lower League FC",
  homeTeamEn: "Manchester City",
  awayTeamEn: "Lower League FC",
  matchTime: "2026-09-05T18:00:00.000Z",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  ...overrides,
})
const market = (id: string) => ({
  id,
  sport: "축구",
  league_code: "잉글FA컵",
  home_team_name: "맨체스터 시티",
  away_team_name: "Lower League FC",
  match_time: fixture().matchTime,
  status: "scheduled",
})

describe("LFA 전용 경기 등록 → 기존 경기 경로", () => {
  beforeEach(() => {
    state.tables = {}
    state.fail = ""
    state.writes = []
    state.cachedBetman = null
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-04T18:00:00.000Z"))
    state.members.mockResolvedValue(
      new Map([
        ["EPL", new Set(["Manchester City", "Chelsea", "Liverpool"])],
        ["EFL챔", new Set(["Leicester City"])],
      ])
    )
    state.fixtures.mockResolvedValue([fixture()])
    state.dictionary.mockResolvedValue([["맨체스터 시티", "Manchester City"]])
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it("인기팀 컵경기를 독립 UUID로 등록하고 매치센터에서 읽는다", async () => {
    const [f] = await getFixturesForDay("2026-09-05")
    expect(f.gameId).toMatch(/^[a-f0-9-]{36}$/)
    expect(f.source).toBe("lfa")
    expect(await getMatchByGameId(f.gameId!)).toMatchObject({
      gameId: f.gameId,
      matchKey: "lfa_cup-city-minnow",
      source: "lfa",
    })
    expect(state.writes).toEqual(["lfa_fixtures"])
    expect(state.tables.betman_games).toEqual([])
  })
  it("재실행·번역/킥오프 변경에도 내부 ID와 투표 키가 유지된다", async () => {
    const one = await syncSupplementalFixtures([fixture()], new Map(), new Set([fixture().lfaId]))
    const two = await syncSupplementalFixtures(
      [fixture({ homeTeam: "맨시티", matchTime: "2026-09-06T19:00:00.000Z" })],
      new Map(),
      new Set()
    )
    expect(supplementalSummary(two.get(fixture().lfaId)!)).toMatchObject({
      gameId: one.get(fixture().lfaId)!.id,
      matchKey: "lfa_cup-city-minnow",
      homeTeam: "맨시티",
    })
    expect(state.tables.lfa_fixtures).toHaveLength(1)
  })
  it("나중에 Betman에 올라와도 기존 LFA UUID·불판 키를 유지한다", async () => {
    const [first] = await getFixturesForDay("2026-09-05")
    state.tables.betman_games = [market("market-b"), market("market-a")]
    const again = await getFixturesForDay("2026-09-05")
    expect(again).toHaveLength(1)
    expect(again[0]).toMatchObject({
      gameId: first.gameId,
      matchKey: first.matchKey,
      betmanGameId: "market-b",
    })
    expect(await getMatchByGameId("market-a")).toMatchObject({
      gameId: first.gameId,
      matchKey: first.matchKey,
    })
    expect(
      await getSiblingGameIds(createServiceRoleClient(), first.gameId!, { strict: true })
    ).toEqual([first.gameId, "market-b", "market-a"])
    await syncSupplementalFixtures([fixture()], new Map(), new Set())
    expect(state.tables.lfa_fixtures[0].betman_game_id).toBe("market-b")
  })
  it("일반팀 미판매 경기와 기존 Betman 경기는 새로 등록하지 않는다", async () => {
    const rows = [
      fixture({ lfaId: "other", homeTeam: "Other FC", homeTeamEn: "Other FC" }),
      fixture(),
    ]
    await syncSupplementalFixtures(
      rows,
      new Map([[fixture().lfaId, "market-a"]]),
      new Set(["other"])
    )
    expect(state.writes).toHaveLength(0)
  })
  it.each([false, true])(
    "연결된 LFA 경기의 킥오프가 15분 바뀌어도 한 줄과 기존 UUID를 유지한다: 마켓 역순 %s",
    async (reverse) => {
      const [first] = await getFixturesForDay("2026-09-05")
      state.tables.betman_games = [market("market-b"), market("market-a")]
      await getFixturesForDay("2026-09-05")
      if (reverse) state.tables.betman_games.reverse()
      state.tables.betman_games.push({
        ...market("unrelated"),
        home_team_name: "Other Home FC",
        away_team_name: "Other Away FC",
      })
      state.fixtures.mockResolvedValue([
        fixture({
          matchTime: "2026-09-05T18:15:00.000Z",
          status: "completed",
          homeScore: 6,
          awayScore: 3,
        }),
      ])

      const rows = await getFixturesForDay("2026-09-05")
      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.gameId)).toEqual(["unrelated", first.gameId])
      expect(rows[1]).toMatchObject({
        matchKey: first.matchKey,
        betmanGameId: "market-b",
        matchTime: "2026-09-05T18:15:00.000Z",
        status: "completed",
        homeScore: 6,
        awayScore: 3,
      })
      expect(state.tables.lfa_fixtures).toHaveLength(1)
    }
  )
  it("베트맨 일별 조회 오류는 빈 목록으로 처리하지 않고 등록 전에 전파한다", async () => {
    state.fail = "betman_games"
    await expect(getFixturesForDay("2026-09-05")).rejects.toThrow(
      "betman-fixtures-day:2026-09-05:unavailable:connection failed"
    )
    expect(state.writes).toHaveLength(0)
    state.fail = ""
    expect((await getFixturesForDay("2026-09-05"))[0].gameId).not.toBeNull()
  })
  it("캐시가 비어 있어도 DB에 같은 리그·킥오프 분의 베트맨 행이 있으면 등록하지 않는다", async () => {
    state.cachedBetman = []
    state.tables.betman_games = [
      {
        ...market("market-a"),
        home_team_name: "다른 표기",
        away_team_name: "미정",
        match_time: "2026-09-05T18:00:41.000Z",
      },
    ]
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const rows = await getFixturesForDay("2026-09-05")
      expect(rows.every((row) => row.gameId === null)).toBe(true)
      expect(state.writes).toHaveLength(0)
      expect(state.tables.lfa_fixtures).toHaveLength(0)
      expect(quiet).toHaveBeenCalledWith(
        expect.stringContaining("LFA 신규 등록 보류"),
        expect.objectContaining({ lfaId: fixture().lfaId })
      )
    } finally {
      quiet.mockRestore()
    }
  })
  it("등록 직전 베트맨 재조회가 실패해도 신규 UUID를 만들지 않는다", async () => {
    state.fail = "betman_games"
    await expect(
      syncSupplementalFixtures([fixture()], new Map(), new Set([fixture().lfaId]))
    ).rejects.toThrow("lfa-fixture-betman-check:cup-city-minnow:unavailable:connection failed")
    expect(state.writes).toHaveLength(0)
  })
  it.each([
    { league_code: "UCL" },
    { match_time: "2026-09-05T17:59:59.000Z" },
    { match_time: "2026-09-05T18:01:00.000Z" },
    { sport: "농구" },
  ])("다른 슬롯·종목의 베트맨 행은 인기팀 미판매 경기 등록을 막지 않는다: %j", async (other) => {
    state.tables.betman_games = [{ ...market("market-a"), ...other }]
    const saved = await syncSupplementalFixtures([fixture()], new Map(), new Set([fixture().lfaId]))
    expect(saved.get(fixture().lfaId)?.id).toMatch(/^[a-f0-9-]{36}$/)
    expect(state.writes).toEqual(["lfa_fixtures"])
  })
  it("같은 슬롯에 짝 못 찾은 베트맨 행이 있으면 LFA 행을 전용 경기로 등록하지 않는다", async () => {
    // 유벤투스–AC밀란(2026-09-07) 재현: 사전 별칭이 없어 짝짓기가 missing — 베트맨이 파는 경기를
    // 못 알아본 것이지 없는 경기가 아니다. 인기팀이라도 이 슬롯의 LFA 행은 보류한다.
    state.dictionary.mockResolvedValue([])
    state.tables.betman_games = [{ ...market("market-a"), away_team_name: "하부리그" }]
    const rows = await getFixturesForDay("2026-09-05")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gameId: "market-a", awayTeam: "하부리그" })
    expect(rows[0].source).toBeUndefined()
    expect(state.writes).toHaveLength(0)
    expect(state.tables.lfa_fixtures ?? []).toHaveLength(0)
  })
  it("등록 실패 시 존재하지 않는 매치센터 링크를 만들지 않는다", async () => {
    state.fail = "lfa_fixtures"
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBeNull()
    } finally {
      quiet.mockRestore()
    }
  })
  it("피드 일시 장애에도 저장된 전용 경기와 링크를 유지한다", async () => {
    const [first] = await getFixturesForDay("2026-09-05")
    state.fixtures.mockResolvedValue([])
    expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBe(first.gameId)
  })
  it("알 수 없는 UUID는 매치센터를 만들지 않는다", async () => {
    expect(await getMatchByGameId("unknown")).toBeNull()
  })
  it("피드 장애 중 Betman 대표 마켓 순서가 바뀌어도 두 줄로 늘지 않는다", async () => {
    const [first] = await getFixturesForDay("2026-09-05")
    state.tables.betman_games = [market("market-b"), market("market-a")]
    await getFixturesForDay("2026-09-05")
    state.tables.betman_games.reverse()
    state.fixtures.mockResolvedValue([])
    const rows = await getFixturesForDay("2026-09-05")
    expect(rows).toHaveLength(1)
    expect(rows[0].gameId).toBe(first.gameId)
  })
  it.each(["EPL", "UCL"])(
    "%s 인기팀은 킥오프가 지나도 일정에만 싣고 베트맨 발매 후 매핑한다",
    async (leagueCode) => {
      state.fixtures.mockResolvedValue([fixture({ leagueCode })])
      const [waiting] = await getFixturesForDay("2026-09-05")
      expect(waiting).toMatchObject({ gameId: null, lfaMatchId: fixture().lfaId })
      expect(state.writes).toHaveLength(0)
      for (const time of ["16:00:00", "16:30:00", "18:00:00", "18:30:00"]) {
        vi.setSystemTime(new Date(`2026-09-05T${time}.000Z`))
        const rows = await getFixturesForDay("2026-09-05")
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ gameId: null, lfaMatchId: fixture().lfaId })
        expect(state.writes).toHaveLength(0)
      }
      state.tables.betman_games = [{ ...market("market-a"), league_code: leagueCode }]
      const mapped = await getFixturesForDay("2026-09-05")
      expect(mapped).toHaveLength(1)
      expect(mapped[0]).toMatchObject({ gameId: "market-a", lfaMatchId: fixture().lfaId })
      expect(mapped[0].source).toBeUndefined()
      expect(state.tables.lfa_fixtures).toHaveLength(0)
      expect(state.writes).toHaveLength(0)
    }
  )
  it("발매 예상 컵경기는 킥오프까지 매핑을 기다리고 미판매 컵경기는 즉시 등록한다", async () => {
    state.fixtures.mockResolvedValue([fixture({ awayTeam: "Chelsea", awayTeamEn: "Chelsea" })])
    vi.setSystemTime(new Date("2026-09-05T15:59:59.999Z"))
    expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBeNull()
    vi.setSystemTime(new Date("2026-09-05T16:00:00.000Z"))
    expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBeNull()
    vi.setSystemTime(new Date("2026-09-05T18:00:00.000Z"))
    expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBeNull()
    expect(state.writes).toHaveLength(0)
    state.fixtures.mockResolvedValue([
      fixture({ lfaId: "never", matchTime: "2026-09-06T18:00:00.000Z" }),
    ])
    expect((await getFixturesForDay("2026-09-06"))[0].gameId).not.toBeNull()
  })
  it.each([false, true])(
    "멤버가 없거나 조회 실패면 unknown으로 경고하고 시간과 무관하게 매핑을 기다린다: %s",
    async (fails) => {
      if (fails) state.members.mockRejectedValue(new Error("members unavailable"))
      else state.members.mockResolvedValue(new Map())
      const quiet = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBeNull()
        expect(state.writes).toHaveLength(0)
        expect(quiet).toHaveBeenCalledWith(expect.stringContaining("발매 범위 unknown"))
        for (const time of ["16:30:00", "18:00:00", "18:30:00"]) {
          vi.setSystemTime(new Date(`2026-09-05T${time}.000Z`))
          expect((await getFixturesForDay("2026-09-05"))[0].gameId).toBeNull()
          expect(state.writes).toHaveLength(0)
        }
        state.tables.betman_games = [market("market-a")]
        const rows = await getFixturesForDay("2026-09-05")
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ gameId: "market-a", lfaMatchId: fixture().lfaId })
        expect(state.tables.lfa_fixtures).toHaveLength(0)
      } finally {
        quiet.mockRestore()
      }
    }
  )
  it("새 정책상 대기 대상이어도 기존 등록 행의 UUID·갱신·연결을 유지한다", async () => {
    const f = fixture({ leagueCode: "UCL" })
    const saved = await syncSupplementalFixtures([f], new Map(), new Set([f.lfaId]))
    const id = saved.get(f.lfaId)!.id
    state.fixtures.mockResolvedValue([{ ...f, homeScore: 1 }])
    expect((await getFixturesForDay("2026-09-05"))[0]).toMatchObject({ gameId: id, homeScore: 1 })
    state.tables.betman_games = [{ ...market("market-a"), league_code: "UCL" }]
    expect((await getFixturesForDay("2026-09-05"))[0]).toMatchObject({
      gameId: id,
      betmanGameId: "market-a",
    })
  })
})
