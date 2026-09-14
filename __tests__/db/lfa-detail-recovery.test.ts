// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { LfaMatchDetails } from "@/lib/lfa/client"
import type { LfaMatchInfo } from "@/lib/lfa/match"

// Identity/read IO is covered by match-refresh-day-outage.test.ts. Here the real
// recovery payload enters the real PostgreSQL RPC, not a mocked writer.
vi.mock("@/lib/match/sibling-ids", () => ({
  getMatchIdentity: async () => ({ gameIds: ["a", "b"], lfaMatchId: "provider-one", pollKeys: [] }),
}))
vi.mock("@/lib/match/supplemental-fixtures", () => ({ getSupplementalFixture: async () => null }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          error: null,
          data: ["a", "b"].map((id) => ({
            id,
            home_team_name: "Home",
            away_team_name: "Away",
            league_code: "EPL",
            match_time: "2026-09-12T19:00:00Z",
          })),
        }),
      }),
    }),
  }),
}))
import { recoverKnownMatchDetails } from "@/lib/lfa/detail-fallback"

const NOW = Date.parse("2026-09-12T20:00:00Z")
const OLD = NOW - 30 * 60_000
const iso = (at: number) => new Date(at).toISOString()
const game = {
  gameId: "a",
  homeTeam: "Home",
  awayTeam: "Away",
  leagueCode: "EPL",
  matchTime: "2026-09-12T19:00:00Z",
}
let db: PGlite

function normal(at: number, changes: Partial<LfaMatchInfo> = {}): LfaMatchInfo {
  return {
    matchId: "provider-one",
    sourceUpdatedAt: at,
    dayUpdatedAt: at,
    detailsUpdatedAt: at,
    finished: false,
    live: true,
    minute: "30",
    homeScore: 2,
    awayScore: 1,
    htHome: null,
    htAway: null,
    stats: [],
    timeline: [],
    ...changes,
  }
}
async function recovered(
  at: number,
  previous: LfaMatchInfo | undefined,
  scores = [3, 1],
  finished = false
) {
  vi.mocked(Date.now).mockReturnValue(at)
  const detail: LfaMatchDetails = {
    match_id: "provider-one",
    header: {
      home: { name: "Home", score: String(scores[0]) },
      away: { name: "Away", score: String(scores[1]) },
      status: {
        state: finished ? "postGame" : "inGame",
        display: finished ? "FT" : "60",
        minute: finished ? "" : "60",
        is_live: !finished,
      },
    },
    stats: [],
    events: [],
  }
  return (
    await recoverKnownMatchDetails(game, previous, async () => ({ details: detail, updatedAt: at }))
  ).info
}
async function write(info: LfaMatchInfo, ids = ["b", "a"]) {
  const { rows } = await db.query<{ result: { written: boolean; payload: LfaMatchInfo } }>(
    "SELECT public.write_lfa_match_snapshot($1, $2, $3, $4) AS result",
    [ids, info.matchId, info, iso(info.sourceUpdatedAt!)]
  )
  return rows[0].result
}
async function stored() {
  return (
    await db.query<{ game_id: string; payload: LfaMatchInfo; finished: boolean; updated_at: Date }>(
      "SELECT game_id, payload, finished, updated_at FROM public.match_details_cache ORDER BY game_id"
    )
  ).rows
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;")
  // Only the two required cache tables and the unchanged atomic-writer migration.
  for (const file of [
    "20260824_match_details_cache.sql",
    "20260824b_lfa_day_cache.sql",
    "20260907_lfa_atomic_snapshots.sql",
  ]) {
    await db.exec(readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"))
  }
}, 30_000)
beforeEach(async () => {
  await db.exec("TRUNCATE public.match_details_cache, public.lfa_day_cache")
  vi.spyOn(Date, "now").mockReturnValue(NOW)
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("unexpected network request")))
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await db?.close()
})

describe("WM-LIVE-01 recovery payload and the actual atomic PostgreSQL writer", () => {
  it("saves fresh details with an unchanged day watermark and leaves the day cache untouched", async () => {
    const previous = normal(OLD)
    await write(previous)
    await db.query("SELECT public.write_lfa_day_snapshot('2026-09-12', $1, $2)", [
      [{ id: "provider-one" }],
      iso(OLD),
    ])
    const dayBefore = await db.query("SELECT * FROM public.lfa_day_cache")
    const fresh = await recovered(NOW, previous)
    expect(fresh).toMatchObject({ sourceUpdatedAt: NOW, detailsUpdatedAt: NOW, dayUpdatedAt: OLD })
    expect((await write(fresh)).written).toBe(true)
    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(rows[0].game_id).toBe("a")
    expect(new Date(rows[0].updated_at).getTime()).toBe(NOW)
    expect(rows[0].payload).toEqual(fresh)
    expect((await db.query("SELECT * FROM public.lfa_day_cache")).rows).toEqual(dayBefore.rows)
  })

  it("accepts repeated recovery, then a normal day-plus-detail refresh with a VAR score decrease", async () => {
    const previous = normal(OLD)
    await write(previous)
    const first = await recovered(NOW, previous)
    expect((await write(first)).written).toBe(true)
    const second = await recovered(NOW + 60_000, first, [4, 1])
    expect((await write(second)).written).toBe(true)
    const corrected = normal(NOW + 120_000, { homeScore: 3, awayScore: 2, minute: "64" })
    const result = await write(corrected)
    expect(result).toEqual({ written: true, payload: corrected })
    expect((await stored())[0].payload).toEqual(corrected)
  })

  it("returns the newer recovery winner when an earlier normal response arrives late", async () => {
    await write(normal(OLD))
    const fresh = await recovered(NOW, normal(OLD))
    await write(fresh)
    expect(await write(normal(NOW - 1_000, { homeScore: 99 }))).toEqual({
      written: false,
      payload: fresh,
    })
    expect((await stored())[0].payload).toEqual(fresh)
  })

  it.each(["day", "detail"] as const)(
    "still refuses a regressing %s component despite a newer aggregate timestamp",
    async (component) => {
      const fresh = await recovered(NOW, normal(OLD))
      await write(fresh)
      const regressed = normal(
        NOW + 60_000,
        component === "day" ? { dayUpdatedAt: OLD - 1 } : { detailsUpdatedAt: NOW - 1 }
      )
      expect(await write(regressed)).toEqual({ written: false, payload: fresh })
      expect((await stored())[0].payload).toEqual(fresh)
    }
  )

  it("protects recovered FT from later live data while accepting a newer FT correction", async () => {
    await write(normal(OLD))
    const ft = await recovered(NOW, normal(OLD), [3, 1], true)
    await write(ft)
    const live = await recovered(NOW + 60_000, ft, [4, 1])
    expect(await write(live)).toEqual({ written: false, payload: ft })
    const correction = await recovered(NOW + 120_000, ft, [2, 1], true)
    expect(await write(correction)).toEqual({ written: true, payload: correction })
    expect((await stored())[0]).toMatchObject({
      finished: true,
      payload: { finished: true, live: false, homeScore: 2 },
    })
  })

  it("rejects a conflicting provider ID without changing the existing cache", async () => {
    const fresh = await recovered(NOW, normal(OLD))
    await write(fresh)
    const conflict = { ...normal(NOW + 60_000), matchId: "provider-other" }
    await expect(write(conflict)).rejects.toThrow("identity conflict")
    expect((await stored())[0].payload).toEqual(fresh)
  })

  it("also blocks legacy direct upserts that would regress recovered time or FT", async () => {
    const ft = await recovered(NOW, normal(OLD), [3, 1], true)
    await write(ft)
    for (const info of [normal(OLD, { finished: true, live: false }), normal(NOW + 60_000)]) {
      await db.query(
        `INSERT INTO public.match_details_cache (game_id, lfa_match_id, payload, finished, updated_at)
        VALUES ('a', $1, $2, $3, $4) ON CONFLICT (game_id) DO UPDATE SET
        payload=excluded.payload, finished=excluded.finished, updated_at=excluded.updated_at`,
        [info.matchId, info, info.finished, iso(info.sourceUpdatedAt!)]
      )
    }
    expect((await stored())[0].payload).toEqual(ft)
  })

  it("allows a first detail-only snapshot with no previous day watermark, then normal refresh", async () => {
    const fresh = await recovered(NOW, undefined)
    expect(fresh.dayUpdatedAt).toBeUndefined()
    expect((await write(fresh)).written).toBe(true)
    const combined = normal(NOW + 60_000)
    expect(await write(combined)).toEqual({ written: true, payload: combined })
  })
})
