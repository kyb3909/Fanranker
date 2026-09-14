import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { auditDb } from "@/__tests__/helpers/audit-db"
import { overnightDayOutage } from "@/__tests__/fixtures/lfa-day-outage-20260913"
import type { LfaMatchDetails } from "@/lib/lfa/client"

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }))
vi.mock("@/lib/supabase/server", async () => {
  const { auditDb } = await import("@/__tests__/helpers/audit-db")
  return { createServiceRoleClient: () => auditDb(mocks.tables).db }
})

// Real identity graph, real supplemental lookup, and real recovery implementation.
import { getMatchIdentity } from "@/lib/match/sibling-ids"
import { recoverKnownMatchDetails } from "@/lib/lfa/detail-fallback"

const NOW = Date.parse(overnightDayOutage.observedAt)
type Group = (typeof overnightDayOutage.groups)[number]

function savedTables() {
  return {
    betman_games: overnightDayOutage.groups.flatMap((group) =>
      group.gameIds.map((id) => ({
        id,
        league_code: group.league,
        home_team_name: group.home,
        away_team_name: group.away,
        match_time: group.kickoff,
      }))
    ),
    lfa_fixtures: overnightDayOutage.groups.flatMap((group) =>
      group.fixtures.map((row) => ({
        id: row.id,
        lfa_match_id: row.lfa_match_id,
        betman_game_id: row.betman_game_id,
        match_time: row.match_time,
        fixture: { homeTeam: row.home, awayTeam: row.away, leagueCode: row.league },
      }))
    ),
    match_details_cache: overnightDayOutage.groups.flatMap((group) =>
      group.details.map((row) => ({ game_id: row.game_id, lfa_match_id: row.lfa_match_id }))
    ),
    match_lineups: overnightDayOutage.groups.flatMap((group) =>
      group.lineups.map((row) => ({
        game_id: row.game_id,
        event_id: row.event_id,
        payload: { source: row.source },
      }))
    ),
  }
}

function key(group: Group, gameId: string) {
  return {
    gameId,
    homeTeam: group.home,
    awayTeam: group.away,
    leagueCode: group.league,
    matchTime: group.kickoff,
  }
}

function simulatedDetail(matchId: string, homeScore = 1) {
  // Deliberately simulated, including English labels different from saved Korean labels.
  // This tests identity compatibility, not whether the provider was reachable that night.
  const details: LfaMatchDetails = {
    match_id: matchId,
    header: {
      home: { name: "Simulated home label", score: String(homeScore) },
      away: { name: "Simulated away label", score: "0" },
      status: { state: "inGame", display: "45", minute: "45", is_live: true },
    },
    stats: [],
    events: [],
  }
  return { details, updatedAt: NOW }
}

describe("WM-LIVE-01 saved overnight identity replay (detail responses simulated)", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("unexpected network request")))
    )
    mocks.tables = savedTables()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(overnightDayOutage.groups)(
    "accepts every saved alias of $home — $away with its own provider ID",
    async (group) => {
      const expectedId = group.details[0].lfa_match_id
      const aliases = [...group.gameIds, ...group.fixtures.map((row) => row.id)].sort()
      const homeScore = overnightDayOutage.groups.indexOf(group) + 1
      const detail = vi.fn(async () => simulatedDetail(expectedId, homeScore))
      for (const gameId of aliases) {
        const identity = await getMatchIdentity(auditDb(mocks.tables).db, gameId, { strict: true })
        expect(identity).toMatchObject({ lfaMatchId: expectedId, gameIds: aliases })
        // Full previous payload.matchId was not captured: do not invent it for this replay.
        const recovered = await recoverKnownMatchDetails(key(group, gameId), undefined, detail)
        expect(recovered.info).toMatchObject({
          matchId: expectedId,
          homeScore,
          awayScore: 0,
          live: true,
          finished: false,
          sourceUpdatedAt: NOW,
          detailsUpdatedAt: NOW,
        })
        expect(recovered.info.dayUpdatedAt).toBeUndefined()
      }
      expect(detail).toHaveBeenCalledTimes(aliases.length)
      expect(detail).toHaveBeenCalledWith(expectedId, true, true)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    }
  )

  it("retains the exact complete IDs visible in the truncated outage excerpts", () => {
    const ids = overnightDayOutage.groups.flatMap((group) => group.errorGameIds)
    expect(ids).toHaveLength(6)
    expect(overnightDayOutage.groups.filter((group) => group.errorGameIds.length)).toHaveLength(5)
    expect(
      overnightDayOutage.groups.find((group) => group.home === "로리앙")?.errorGameIds
    ).toEqual(["349026ef-372f-40ce-adde-519a9ce26586", "d228740f-771a-4b2e-9ddd-76a41da41217"])
  })
})

describe("LFA-only fixture recovery guards (synthetic unlinked variant)", () => {
  const group = overnightDayOutage.groups.find((row) => row.home === "선덜랜드")!
  const fixture = group.fixtures[0]

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("unexpected network request")))
    )
    const tables = savedTables()
    mocks.tables = {
      betman_games: [],
      lfa_fixtures: tables.lfa_fixtures
        .filter((row) => row.id === fixture.id)
        .map((row) => ({ ...row, betman_game_id: null })),
      match_details_cache: [],
      match_lineups: [],
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("accepts a standalone saved fixture without a Betman row or cached detail identity", async () => {
    const detail = vi.fn(async () => simulatedDetail(fixture.lfa_match_id))
    await expect(
      recoverKnownMatchDetails(key(group, fixture.id), undefined, detail)
    ).resolves.toMatchObject({ info: { matchId: fixture.lfa_match_id, live: true } })
    expect(detail).toHaveBeenCalledOnce()
  })

  it("rejects a contradictory requested team before buying the detail", async () => {
    const detail = vi.fn()
    await expect(
      recoverKnownMatchDetails(
        { ...key(group, fixture.id), awayTeam: "Different opponent" },
        undefined,
        detail
      )
    ).rejects.toThrow("lfa-detail-fallback-fixture-conflict")
    expect(detail).not.toHaveBeenCalled()
  })

  it("rejects a contradictory kickoff inside the live window before buying the detail", async () => {
    const detail = vi.fn()
    await expect(
      recoverKnownMatchDetails(
        {
          ...key(group, fixture.id),
          matchTime: new Date(Date.parse(group.kickoff) + 60_000).toISOString(),
        },
        undefined,
        detail
      )
    ).rejects.toThrow("lfa-detail-fallback-fixture-conflict")
    expect(detail).not.toHaveBeenCalled()
  })
})
