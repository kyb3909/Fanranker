import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { lfaLeagueId } from "@/lib/lfa/leagues"
import type { LfaMatch, LfaMatchDetails } from "@/lib/lfa/client"
import type { CachedMatchDetails } from "@/lib/lfa/persist"

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  readDay: vi.fn(),
  readDetails: vi.fn(),
  writeDay: vi.fn(),
  writeDetails: vi.fn(),
  supplemental: vi.fn(),
  tables: {} as Record<string, Record<string, unknown>[]>,
  stored: new Map<string, CachedMatchDetails>(),
}))

vi.mock("react", () => ({ cache: (fn: unknown) => fn }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/lfa/client", () => ({ lfaFetch: mocks.fetch }))
vi.mock("@/lib/lfa/persist", () => ({
  readDayMatches: mocks.readDay,
  readMatchDetails: mocks.readDetails,
  writeDayMatches: mocks.writeDay,
  writeMatchDetails: mocks.writeDetails,
}))
vi.mock("@/lib/supabase/server", async () => {
  const { auditDb } = await import("@/__tests__/helpers/audit-db")
  return { createServiceRoleClient: () => auditDb(mocks.tables).db }
})
vi.mock("@/lib/match/supplemental-fixtures", () => ({ getSupplementalFixture: mocks.supplemental }))
vi.mock("@/lib/match/lineup-store", () => ({ loadStoredLineup: async () => null }))
vi.mock("@/lib/match/resolve-team-id", () => ({ resolveTeamId: async () => null }))
vi.mock("@/lib/lfa/stat-coverage-notice", () => ({ reportStatCoverageGap: async () => {} }))

import { createLfaRefreshSession, type LfaMatchInfo } from "@/lib/lfa/match"

// Same UTC day and kickoff: a date-level failure must not exchange these games' scores.
const NOW = Date.parse("2026-09-12T19:45:00Z")
const OLD = NOW - 24 * 60_000
const first = {
  gameId: "game-lorient",
  homeTeam: "Lorient",
  awayTeam: "Toulouse",
  leagueCode: "프리그1",
  matchTime: "2026-09-12T18:45:00Z",
}
const second = {
  ...first,
  gameId: "game-le-havre",
  homeTeam: "Le Havre",
  awayTeam: "Angers",
}
const providerId = (gameId: string) =>
  gameId === second.gameId ? "provider-havre" : "provider-lorient"

function oldInfo(id = "provider-lorient"): LfaMatchInfo {
  return {
    matchId: id,
    sourceUpdatedAt: OLD,
    dayUpdatedAt: OLD,
    detailsUpdatedAt: OLD,
    finished: false,
    live: true,
    minute: "36",
    homeScore: 2,
    awayScore: 1,
    htHome: null,
    htAway: null,
    stats: [],
    timeline: [],
  }
}

function dayMatch(game = first): LfaMatch {
  return {
    id: providerId(game.gameId),
    league: { id: lfaLeagueId(game.leagueCode)!, name: "Ligue 1" },
    kickoff: "18:45",
    status: { status: "inGame", state: "inGame", display: "36", is_live: true },
    home: { id: `home-${game.gameId}`, name: game.homeTeam, score: "2" },
    away: { id: `away-${game.gameId}`, name: game.awayTeam, score: "1" },
  }
}

function freshDetail(game = first, home = "3", away = "1", finished = false): LfaMatchDetails {
  return {
    match_id: providerId(game.gameId),
    header: {
      home: { name: game.homeTeam, score: home },
      away: { name: game.awayTeam, score: away },
      status: {
        state: finished ? "postGame" : "inGame",
        display: finished ? "FT" : "60",
        minute: finished ? "" : "60",
        is_live: !finished,
      },
    },
    events: [],
    stats: [{ label: "Possession", home: "55%", away: "45%" }],
  }
}

function useDetails(response: LfaMatchDetails | null) {
  mocks.fetch.mockImplementation(async (endpoint: string) =>
    endpoint === "matches" ? null : response
  )
}

describe("WM-LIVE-01: day feed outage with an established provider identity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(NOW)
    // Any unmocked transport is a test error, never an external request.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("unexpected network request")))
    )
    mocks.stored.clear()
    mocks.tables = {
      betman_games: [first, second].map((game) => ({
        id: game.gameId,
        sport: "축구",
        home_team_name: game.homeTeam,
        away_team_name: game.awayTeam,
        league_code: game.leagueCode,
        match_time: game.matchTime,
      })),
      match_details_cache: [first, second].map((game) => ({
        game_id: game.gameId,
        lfa_match_id: providerId(game.gameId),
        payload: oldInfo(providerId(game.gameId)),
        updated_at: new Date(OLD).toISOString(),
        finished: false,
      })),
    }
    for (const game of [first, second]) {
      mocks.stored.set(game.gameId, {
        info: oldInfo(providerId(game.gameId)),
        updatedAt: OLD,
        stale: true,
      })
    }
    mocks.readDetails.mockImplementation(async (id: string) => mocks.stored.get(id) ?? null)
    mocks.readDay.mockResolvedValue({
      matches: [dayMatch(first), dayMatch(second)],
      updatedAt: OLD,
      stale: true,
    })
    mocks.supplemental.mockResolvedValue(null)
    mocks.writeDay.mockResolvedValue(undefined)
    mocks.writeDetails.mockImplementation(async (id: string, info: LfaMatchInfo) => {
      mocks.stored.set(id, { info, updatedAt: info.sourceUpdatedAt!, stale: false })
      return { written: true, info }
    })
    useDetails(freshDetail())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("stores fresh verified detail when the shared day request fails, without refreshing old day data", async () => {
    const result = await createLfaRefreshSession()(first)
    expect(result).toMatchObject({
      status: "updated",
      info: {
        matchId: "provider-lorient",
        homeScore: 3,
        awayScore: 1,
        minute: "60",
        sourceUpdatedAt: NOW,
        detailsUpdatedAt: NOW,
        dayUpdatedAt: OLD,
      },
    })
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", {
      match_id: "provider-lorient",
      lang: "en",
    })
    expect(mocks.writeDetails).toHaveBeenCalledWith(first.gameId, result.info, { strict: true })
    expect(mocks.writeDay).not.toHaveBeenCalled()
  })

  it("keeps simultaneous games distinct while sharing one failed day request", async () => {
    mocks.fetch.mockImplementation(async (endpoint: string, params: Record<string, string>) => {
      if (endpoint === "matches") return null
      return params.match_id === "provider-havre"
        ? freshDetail(second, "0", "4")
        : freshDetail(first, "3", "1")
    })
    const refresh = createLfaRefreshSession()
    const results = await Promise.all([refresh(first), refresh(second)])
    expect(results[0].info).toMatchObject({
      matchId: "provider-lorient",
      homeScore: 3,
      awayScore: 1,
    })
    expect(results[1].info).toMatchObject({ matchId: "provider-havre", homeScore: 0, awayScore: 4 })
    expect(mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "matches")).toHaveLength(1)
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(2)
    expect(mocks.writeDetails).toHaveBeenCalledTimes(2)
  })

  it("accepts a fresh VAR score decrease as one score pair", async () => {
    useDetails(freshDetail(first, "1", "2"))
    expect((await createLfaRefreshSession()(first)).info).toMatchObject({
      homeScore: 1,
      awayScore: 2,
      sourceUpdatedAt: NOW,
    })
  })

  it("accepts a fresh FT and stops purchasing a complete stored finish", async () => {
    const detail = freshDetail(first, "2", "2", true)
    detail.events = [
      { type: "yellow_card", time: "90", side: "home", detail: { player: { name: "Player One" } } },
    ]
    useDetails(detail)
    const refresh = createLfaRefreshSession()
    const result = await refresh(first)
    expect(result.info).toMatchObject({
      finished: true,
      live: false,
      minute: null,
      homeScore: 2,
      awayScore: 2,
    })
    const calls = mocks.fetch.mock.calls.length
    expect(await refresh(first)).toMatchObject({ status: "settled" })
    expect(mocks.fetch).toHaveBeenCalledTimes(calls)
  })

  it("preserves the previous cache when day and detail both fail", async () => {
    const previous = structuredClone(mocks.stored.get(first.gameId))
    useDetails(null)
    await expect(createLfaRefreshSession()(first)).rejects.toThrow("lfa-details-failed")
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", expect.anything())
    expect(mocks.writeDetails).not.toHaveBeenCalled()
    expect(mocks.stored.get(first.gameId)).toEqual(previous)
    expect(mocks.writeDay).not.toHaveBeenCalled()
  })

  it("never turns old name-matched day rows into a new provider identity during an outage", async () => {
    mocks.stored.clear()
    mocks.tables.match_details_cache = []
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(0)
    expect(mocks.writeDetails).not.toHaveBeenCalled()
    expect(mocks.writeDay).not.toHaveBeenCalled()
  })

  it("requires saved identity evidence beyond a provider ID inside the old payload", async () => {
    mocks.tables.match_details_cache = []
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(0)
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("rejects conflicting saved lineup and detail provider identities before fetching", async () => {
    mocks.tables.match_lineups = [
      {
        game_id: first.gameId,
        event_id: "provider-other",
        payload: { source: "lfa", matchId: "provider-other" },
      },
    ]
    await expect(createLfaRefreshSession()(first)).rejects.toThrow(
      "match-identity-provider-conflict"
    )
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(0)
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("rejects one provider ID shared by two different saved simultaneous fixtures", async () => {
    mocks.tables.match_details_cache[1].lfa_match_id = "provider-lorient"
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(0)
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("requires the requested match key to agree with the saved fixture", async () => {
    await expect(createLfaRefreshSession()({ ...first, awayTeam: "Angers" })).rejects.toThrow()
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(0)
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it.each([-1, 241])(
    "does not buy fallback details outside kickoff through four hours (%i minutes)",
    async (minutes) => {
      const matchTime = new Date(NOW - minutes * 60_000).toISOString()
      mocks.tables.betman_games[0].match_time = matchTime
      await expect(createLfaRefreshSession()({ ...first, matchTime })).rejects.toThrow()
      expect(
        mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
      ).toHaveLength(0)
      expect(mocks.writeDetails).not.toHaveBeenCalled()
    }
  )

  it("does not hide a day persistence failure behind a successful detail recovery", async () => {
    mocks.fetch.mockImplementation(async (endpoint: string) =>
      endpoint === "matches" ? { matches: [dayMatch(first), dayMatch(second)] } : freshDetail()
    )
    mocks.writeDay.mockRejectedValue(new Error("lfa-day-persist-failed"))
    await expect(createLfaRefreshSession()(first)).rejects.toThrow("lfa-day-persist-failed")
    expect(
      mocks.fetch.mock.calls.filter(([endpoint]) => endpoint === "live_match_details")
    ).toHaveLength(0)
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("does not persist a detail response belonging to another provider match", async () => {
    useDetails({ ...freshDetail(), match_id: "provider-havre" })
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", {
      match_id: "provider-lorient",
      lang: "en",
    })
    expect(mocks.writeDetails).not.toHaveBeenCalled()
    expect(mocks.stored.get(first.gameId)?.info.sourceUpdatedAt).toBe(OLD)
  })

  it("does not claim fresh scores when the detail header has no complete score pair", async () => {
    const detail = freshDetail()
    detail.header.away.score = ""
    useDetails(detail)
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", expect.anything())
    expect(mocks.writeDetails).not.toHaveBeenCalled()
    expect(mocks.stored.get(first.gameId)?.info).toEqual(oldInfo())
  })

  it("does not revive a pregame detail as live using the old cached status", async () => {
    const detail = freshDetail()
    detail.header.status = { state: "preGame", display: "", minute: "", is_live: false }
    useDetails(detail)
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", expect.anything())
    expect(mocks.writeDetails).not.toHaveBeenCalled()
  })

  it("preserves existing live-status precedence when a display string also says FT", async () => {
    const detail = freshDetail(first, "2", "2", true)
    detail.header.status.is_live = true
    detail.header.status.minute = "90"
    useDetails(detail)
    expect((await createLfaRefreshSession()(first)).info).toMatchObject({
      finished: false,
      live: true,
      minute: "90",
    })
  })

  it("does not republish old timeline or statistics with the new detail timestamp", async () => {
    const previous = mocks.stored.get(first.gameId)!
    previous.info.stats = [{ label: "old stat", home: "1", away: "0", homeNum: 1, awayNum: 0 }]
    previous.info.timeline = [
      { kind: "goal", minute: "1", side: "home", player: "Old Player", score: "1-0" },
    ]
    const detail = freshDetail()
    detail.stats = []
    detail.events = []
    useDetails(detail)
    expect((await createLfaRefreshSession()(first)).info).toMatchObject({
      sourceUpdatedAt: NOW,
      dayUpdatedAt: OLD,
      stats: [],
      timeline: [],
    })
  })

  it("does not call a delayed detail response fresh after its request-time freshness limit", async () => {
    mocks.fetch.mockImplementation(async (endpoint: string) => {
      if (endpoint === "matches") return null
      vi.mocked(Date.now).mockReturnValue(NOW + 5 * 60_000)
      return freshDetail()
    })
    await expect(createLfaRefreshSession()(first)).rejects.toThrow()
    expect(mocks.fetch).toHaveBeenCalledWith("live_match_details", expect.anything())
    expect(mocks.writeDetails).not.toHaveBeenCalled()
    expect(mocks.stored.get(first.gameId)?.info.sourceUpdatedAt).toBe(OLD)
  })

  it("returns the newer database winner when the atomic store supersedes this request", async () => {
    const winner = {
      ...oldInfo(),
      homeScore: 4,
      awayScore: 1,
      sourceUpdatedAt: NOW + 1_000,
      detailsUpdatedAt: NOW + 1_000,
    }
    mocks.writeDetails.mockResolvedValue({ written: false, info: winner })
    expect(await createLfaRefreshSession()(first)).toMatchObject({
      status: "superseded",
      info: winner,
    })
  })
})
