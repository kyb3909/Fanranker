import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LfaFixture } from "@/lib/lfa/fixtures"

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  fail: "",
  writes: [] as string[],
  fixtures: vi.fn(),
  dictionary: vi.fn(),
}))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/lfa/fixtures", () => ({ getLfaFixturesForMatchday: state.fixtures }))
vi.mock("@/lib/lfa/match", () => ({ cachedTeamEn: state.dictionary }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      type Row = Record<string, unknown>
      const filters: ((r: Row) => boolean)[] = []
      let pending: Row[] | undefined
      let single = false
      const run = () => {
        if (state.fail === table) return { data: null, error: { code: "unavailable" } }
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
        const found = rows.filter((r) => filters.every((f) => f(r)))
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
    state.fixtures.mockResolvedValue([fixture()])
    state.dictionary.mockResolvedValue([["맨체스터 시티", "Manchester City"]])
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
})
