// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mappingInputHash,
  resolveTeam,
  runMatchMappingShadow,
  type BetmanGameRow,
} from "@/lib/soccerway/match-mapping"
import {
  groupMappingGames,
  loadMappingAttempts,
  loadMappingDictionary,
} from "@/lib/soccerway/mapping-candidates"

type Row = Record<string, any>
const version = "match-mapping@2026-08-07.2"
const now = Date.parse("2026-09-06T18:00:00Z")
const dictionary = [
  {
    soccerway_team_id: "AAAAAAA1",
    slug: "home",
    name_en: "Home",
    name_kr: "홈",
    aliases_kr: [],
    status: "proposed",
  },
  {
    soccerway_team_id: "BBBBBBB2",
    slug: "away",
    name_en: "Away",
    name_kr: "원정",
    aliases_kr: [],
    status: "proposed",
  },
]
it("does not build Soccerway URLs from LFA placeholder team IDs", () => {
  const placeholder = { ...dictionary[0], soccerway_team_id: "lfa_source_team" }
  expect(resolveTeam("홈", [placeholder])).toBeNull()
  expect(resolveTeam("홈", [placeholder, dictionary[0]])).toEqual(dictionary[0])
})
function game(index: number, market = 0): BetmanGameRow & { sport: string } {
  return {
    id: `g${String(index).padStart(4, "0")}-${market}`,
    home_team_name: "홈",
    away_team_name: "원정",
    league_code: "EPL",
    sport: "축구",
    match_time: new Date(now - 12 * 3600_000 + index * 60_000).toISOString(),
  }
}
function prior(g: BetmanGameRow, index: number, extra: Row = {}): Row {
  return {
    id: `a${String(index).padStart(6, "0")}`,
    game_id: g.id,
    input_hash: mappingInputHash(
      g,
      dictionary[0].soccerway_team_id,
      dictionary[1].soccerway_team_id
    ),
    predicate_version: version,
    attempt: 1,
    status: "ok",
    outcome: "proposed",
    created_at: new Date(now - 3600_000).toISOString(),
    ...extra,
  }
}

// Query-aware in-memory DB: filters, keyset cursors, response caps, and persisted writes
// are exercised by the actual runner, not replaced with a preselected candidate list.
function database(games: Row[], attempts: Row[] = [], teams: Row[] = dictionary) {
  const tables: Record<string, Row[]> = {
    betman_games: games,
    match_mapping_attempts: [...attempts],
    team_dictionary: [...teams],
  }
  const reads: { table: string; size: number; ids?: number }[] = []
  let failure: ((table: string, query: { after?: string; insert: boolean }) => boolean) | undefined
  const db = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let sortKey = "id",
        ascending = true,
        cap = 1000,
        insert: Row | undefined,
        after: string | undefined,
        ids: number | undefined
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters.push((r) => r[key] === value)
          return q
        },
        gte: (key: string, value: string) => {
          filters.push((r) => r[key] >= value)
          return q
        },
        lte: (key: string, value: string) => {
          filters.push((r) => r[key] <= value)
          return q
        },
        gt: (key: string, value: string) => {
          after = value
          filters.push((r) => r[key] > value)
          return q
        },
        in: (key: string, values: string[]) => {
          ids = values.length
          filters.push((r) => values.includes(r[key]))
          return q
        },
        order: (key: string, options?: { ascending: boolean }) => {
          sortKey = key
          ascending = options?.ascending ?? true
          return q
        },
        limit: (value: number) => {
          cap = value
          return q
        },
        insert: (row: Row) => {
          insert = row
          return q
        },
        then: (resolve: (result: unknown) => unknown) => {
          if (failure?.(table, { after, insert: !!insert }))
            return Promise.resolve(
              resolve({ data: null, error: { message: "injected DB failure" } })
            )
          if (insert) {
            const rows = tables[table]
            if (
              ["ok", "dead_letter"].includes(insert.status) &&
              rows.some(
                (r) =>
                  ["ok", "dead_letter"].includes(r.status) &&
                  r.game_id === insert!.game_id &&
                  r.input_hash === insert!.input_hash &&
                  r.predicate_version === insert!.predicate_version
              )
            ) {
              return Promise.resolve(
                resolve({ data: null, error: { message: "duplicate terminal judgement" } })
              )
            }
            rows.push({
              ...insert,
              id: `z${String(rows.length).padStart(6, "0")}`,
              created_at: new Date().toISOString(),
            })
            return Promise.resolve(resolve({ data: null, error: null }))
          }
          const data = tables[table]
            .filter((r) => filters.every((f) => f(r)))
            .sort(
              (a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * (ascending ? 1 : -1)
            )
            .slice(0, Math.min(cap, 1000))
          reads.push({ table, size: data.length, ids })
          return Promise.resolve(resolve({ data, error: null }))
        },
      }
      return q
    },
  }
  return {
    db: db as unknown as SupabaseClient,
    tables,
    reads,
    fail: (fn: typeof failure) => {
      failure = fn
    },
  }
}
const notFound = vi.fn(async (url: string) => ({ httpStatus: 404, finalUrl: url, html: null }))
const options = { limit: 1, discoverLimit: 0, paceMs: 0, fetcher: notFound }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  notFound.mockClear()
})
afterEach(() => vi.useRealTimers())

describe("mapping sweep coverage and continuation", () => {
  it("reaches a match after 200 settled market rows with a one-match budget", async () => {
    const games = Array.from({ length: 51 }, (_, i) =>
      Array.from({ length: 4 }, (_, m) => game(i, m))
    ).flat()
    const d = database(
      games,
      Array.from({ length: 50 }, (_, i) => prior(game(i, 3), i))
    )
    const result = await runMatchMappingShadow(d.db, options)
    expect(result).toMatchObject({
      candidateRows: 204,
      candidateMatches: 51,
      scanned: 1,
      skipped: 50,
      deferred: 0,
      errors: [],
    })
    expect(d.tables.match_mapping_attempts.at(-1)?.game_id).toBe(game(50).id)
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(d.reads.filter((r) => r.table === "betman_games").map((r) => r.size)).toEqual([200, 4])
  })

  it("counts matches rather than markets and resumes the remaining matches next run", async () => {
    const d = database(
      Array.from({ length: 3 }, (_, i) => Array.from({ length: 4 }, (_, m) => game(i, m))).flat()
    )
    const first = await runMatchMappingShadow(d.db, { ...options, limit: 2 })
    expect(first).toMatchObject({ candidateRows: 12, candidateMatches: 3, scanned: 2, deferred: 1 })
    const second = await runMatchMappingShadow(d.db, { ...options, limit: 2 })
    expect(second).toMatchObject({ scanned: 1, skipped: 2, deferred: 0 })
    expect(new Set(d.tables.match_mapping_attempts.map((r) => r.game_id)).size).toBe(3)
  })

  it("reuses a judgement on a non-representative sibling, including newly added markets", async () => {
    const d = database([game(0, 0), game(0, 1)], [prior(game(0, 1), 1)])
    expect(await runMatchMappingShadow(d.db, options)).toMatchObject({ scanned: 0, skipped: 1 })
    expect(notFound).not.toHaveBeenCalled()
  })

  it("rotates unresolved discovery retries using persisted attempt times", async () => {
    const games = [game(0), game(1), game(2)]
    const attempts = games.map((g, i) =>
      prior(g, i, { input_hash: mappingInputHash(g, null, null), outcome: "team_unresolved" })
    )
    const d = database(games, attempts, [])
    const proposer = vi.fn(async () => [] as string[])
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(now + i * 3600_000)
      const result = await runMatchMappingShadow(d.db, { ...options, discoverLimit: 1, proposer })
      expect(result).toMatchObject({ scanned: 1, teamUnresolved: 1, deferred: 2, errors: [] })
    }
    expect(
      d.tables.match_mapping_attempts.slice(3).map((r) => [r.game_id, r.status, r.attempt])
    ).toEqual(games.map((g) => [g.id, "retry_wait", 2]))
    expect(proposer).toHaveBeenCalledTimes(3)
  })

  it("does not repeat already mapped matches if a later candidates page fails", async () => {
    const d = database(Array.from({ length: 201 }, (_, i) => game(i)))
    d.fail((table, q) => table === "betman_games" && !!q.after)
    const result = await runMatchMappingShadow(d.db, options)
    expect(result.errors).toEqual(["betman_games 조회 실패: injected DB failure"])
    expect(notFound).not.toHaveBeenCalled()
    expect(d.tables.match_mapping_attempts).toHaveLength(0)
  })

  it("paginates dictionaries and attempt histories, with at most 100 IDs per query", async () => {
    const games = Array.from({ length: 205 }, (_, i) => game(i))
    const attempts = Array.from({ length: 1201 }, (_, i) =>
      prior(games[0], i, { status: "retry_wait" })
    )
    const teams = Array.from({ length: 401 }, (_, i) => ({
      ...dictionary[0],
      soccerway_team_id: `t${String(i).padStart(4, "0")}`,
    }))
    const d = database(games, attempts, teams)
    expect(await loadMappingDictionary(d.db)).toHaveLength(401)
    expect(
      await loadMappingAttempts(
        d.db,
        games.map((g) => g.id),
        version
      )
    ).toHaveLength(1201)
    expect(
      Math.max(...d.reads.filter((r) => r.table === "match_mapping_attempts").map((r) => r.ids!))
    ).toBe(100)
  })

  it("aborts on a later history page failure before any external work", async () => {
    const g = game(0)
    const d = database(
      [g],
      Array.from({ length: 201 }, (_, i) => prior(g, i, { status: "retry_wait" }))
    )
    d.fail((table, q) => table === "match_mapping_attempts" && !!q.after)
    expect((await runMatchMappingShadow(d.db, options)).errors).toHaveLength(1)
    expect(notFound).not.toHaveBeenCalled()
  })

  it("keeps unsaved results eligible and reports the DB error", async () => {
    const d = database([game(0)])
    d.fail((table, q) => table === "match_mapping_attempts" && q.insert)
    expect((await runMatchMappingShadow(d.db, options)).errors).toHaveLength(1)
    d.fail(undefined)
    expect(await runMatchMappingShadow(d.db, options)).toMatchObject({ scanned: 1, errors: [] })
    expect(d.tables.match_mapping_attempts).toHaveLength(1)
  })

  it("reports eligible matches deferred when the time budget is exhausted", async () => {
    const d = database([game(0), game(1)])
    expect(await runMatchMappingShadow(d.db, { ...options, timeBudgetMs: 0 })).toMatchObject({
      scanned: 0,
      deferred: 2,
    })
    expect(notFound).not.toHaveBeenCalled()
  })

  it("does not merge different leagues or reverse fixtures", () => {
    expect(
      groupMappingGames([
        game(0),
        game(0, 1),
        { ...game(0, 2), league_code: "UCL" },
        { ...game(0, 3), home_team_name: "원정", away_team_name: "홈" },
      ])
    ).toHaveLength(3)
  })
})
