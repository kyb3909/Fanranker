import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import type { FixtureRow } from "@/lib/match/get-fixtures"

const m = vi.hoisted(() => ({
  db: {} as any,
  lineup: vi.fn(),
  refresh: vi.fn(),
  identity: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => m.db }))
vi.mock("@/lib/match/get-lineup", () => ({ getMatchLineup: m.lineup }))
vi.mock("@/lib/match/sibling-ids", () => ({ getMatchIdentity: m.identity }))
vi.mock("@/lib/lfa/match", () => ({ createLfaRefreshSession: () => m.refresh }))
import { recoverMatchMaterials } from "@/lib/match/recover-materials"

const fixture = (id = "recovered", age = 7): FixtureRow => ({
  gameId: id,
  matchKey: id,
  homeTeam: "Chelsea",
  awayTeam: "Leeds",
  leagueCode: "EPL",
  matchTime: new Date(Date.now() - age * 3600_000).toISOString(),
  status: "completed",
  homeScore: 2,
  awayScore: 1,
})
const confirmed = { status: "ready", projected: false }
const finished = { finished: true, homeScore: 2, awayScore: 1, timeline: [{ kind: "goal" }] }
let rows: Record<string, any[]>
let failTable: string | null
const saveLineup = (id: string) => rows.match_lineups.push({ game_id: id, payload: confirmed })
const saveDetails = (id: string) =>
  rows.match_details_cache.push({
    game_id: id,
    finished: true,
    payload: finished,
    updated_at: new Date().toISOString(),
  })

describe("late mapping material recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-10T09:00:00Z"))
    vi.resetAllMocks()
    failTable = null
    rows = { match_lineups: [], match_details_cache: [], lfa_material_recovery_attempts: [] }
    m.identity.mockImplementation(async (_db, id) => ({
      gameIds: [id],
      lfaMatchId: `lfa-${id}`,
      pollKeys: [],
    }))
    m.db = {
      from: (table: string) => ({
        select: () => ({
          in: (field: string, ids: string[]) =>
            Promise.resolve({
              data: rows[table].filter((r) => ids.includes(r[field])),
              error: table === failTable ? { message: "offline" } : null,
            }),
        }),
      }),
      rpc: vi.fn(async (_name, { p_lfa_match_id: id }) => {
        const row = rows.lfa_material_recovery_attempts.find((r) => r.lfa_match_id === id)
        if (row && Date.now() - Date.parse(row.attempted_at) < 900_000)
          return { data: false, error: null }
        if (row) row.attempted_at = new Date().toISOString()
        else
          rows.lfa_material_recovery_attempts.push({
            lfa_match_id: id,
            attempted_at: new Date().toISOString(),
          })
        return { data: true, error: null }
      }),
    }
    m.lineup.mockImplementation(async (id) => {
      saveLineup(id)
      return confirmed
    })
    m.refresh.mockImplementation(async (f) => {
      saveDetails(f.gameId)
      return { info: finished }
    })
  })
  afterEach(() => vi.useRealTimers())

  it("counts only artifacts confirmed by a post-save DB read", async () => {
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({
      attempted: 1,
      lineups: 1,
      details: 1,
      complete: 1,
      pending: 0,
    })
    expect(m.lineup.mock.invocationCallOrder[0]).toBeLessThan(m.refresh.mock.invocationCallOrder[0])
  })
  it("does not count ready responses whose saves failed", async () => {
    m.lineup.mockResolvedValue(confirmed)
    m.refresh.mockResolvedValue({ info: finished })
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({
      attempted: 1,
      lineups: 0,
      details: 0,
      complete: 0,
      pending: 1,
    })
  })
  it("does not count a stored unfinished or empty response as recovered", async () => {
    m.refresh.mockImplementation(async (f) =>
      rows.match_details_cache.push({
        game_id: f.gameId,
        finished: true,
        payload: { ...finished, timeline: [] },
      })
    )
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({
      lineups: 1,
      details: 0,
      pending: 1,
    })
  })
  it("keeps details independent when lineup acquisition fails", async () => {
    m.lineup.mockRejectedValue(new Error("lineup supplier offline"))
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({
      details: 1,
      pending: 1,
      errors: [{ reason: "lineup supplier offline" }],
    })
  })
  it("reuses complete artifacts and claims no budget", async () => {
    saveLineup("recovered")
    saveDetails("recovered")
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({ attempted: 0, complete: 1 })
    expect(m.db.rpc).not.toHaveBeenCalled()
  })
  it("repairs only the missing stage", async () => {
    saveDetails("recovered")
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({
      lineups: 1,
      details: 0,
      complete: 1,
    })
    expect(m.refresh).not.toHaveBeenCalled()
  })
  it("uses the existing confidence policy for confirmed legacy lineups", async () => {
    rows.match_lineups.push({
      game_id: "recovered",
      payload: { status: "ready", kickoff: fixture().matchTime, fetchedAt: fixture().matchTime },
    })
    saveDetails("recovered")
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({ complete: 1, attempted: 0 })
    expect(m.lineup).not.toHaveBeenCalled()
  })
  it("does not spend calls when DB state cannot be read", async () => {
    failTable = "match_lineups"
    expect((await recoverMatchMaterials([fixture()])).errors).toHaveLength(1)
    expect(m.db.rpc).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })
  it("the 25th match gets the next turn even when the first 24 always fail", async () => {
    const fixtures = Array.from({ length: 25 }, (_, i) => fixture(String(i).padStart(2, "0")))
    m.lineup.mockRejectedValue(new Error("offline"))
    m.refresh.mockRejectedValue(new Error("offline"))
    expect(await recoverMatchMaterials(fixtures)).toMatchObject({ attempted: 24, deferred: 1 })
    vi.setSystemTime(Date.now() + 900_000)
    m.refresh.mockClear()
    await recoverMatchMaterials(fixtures)
    expect(m.refresh.mock.calls[0][0].gameId).toBe("24")
  })
  it("failed reservations keep their cooldown, and later retry automatically", async () => {
    m.refresh.mockRejectedValue(new Error("offline"))
    await recoverMatchMaterials([fixture()])
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({ attempted: 0, deferred: 1 })
    vi.setSystemTime(Date.now() + 900_000)
    expect(await recoverMatchMaterials([fixture()])).toMatchObject({ attempted: 1 })
  })
  it("two aliases share a single supplier reservation", async () => {
    m.identity.mockResolvedValue({ gameIds: ["a", "b"], lfaMatchId: "one-match", pollKeys: [] })
    expect(await recoverMatchMaterials([fixture("a"), fixture("b")])).toMatchObject({
      targets: 1,
      attempted: 1,
    })
  })
  it("stops unresolved or conflicting identities before any supplier call", async () => {
    m.identity.mockResolvedValue({ gameIds: ["recovered"], lfaMatchId: null, pollKeys: [] })
    expect((await recoverMatchMaterials([fixture()])).errors).toHaveLength(1)
    m.identity.mockResolvedValue({ gameIds: ["recovered"], lfaMatchId: "one", pollKeys: [] })
    expect(
      (await recoverMatchMaterials([{ ...fixture(), lfaMatchId: "two" }])).errors
    ).toHaveLength(1)
    expect(m.refresh).not.toHaveBeenCalled()
  })
  it("respects live ownership, cancellation, expiry and its own execution budget", async () => {
    await recoverMatchMaterials([
      fixture("live", 2),
      fixture("expired", 25),
      { ...fixture("cancelled"), status: "cancelled" },
    ])
    expect(m.refresh).not.toHaveBeenCalled()
    expect(await recoverMatchMaterials([fixture()], Date.now() - 90_001)).toMatchObject({
      attempted: 0,
      deferred: 1,
    })
  })
})
