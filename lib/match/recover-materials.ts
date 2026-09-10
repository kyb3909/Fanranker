import "server-only"
import type { FixtureRow } from "./get-fixtures"
import { getMatchLineup } from "./get-lineup"
import { createLfaRefreshSession } from "@/lib/lfa/match"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getMatchIdentity } from "./sibling-ids"
import { isMatchPageLeague } from "./leagues"
import { pickDetailsRow } from "./pick-sibling-row"
import { lineupConfidence } from "./lineup-confidence"

type DB = ReturnType<typeof createServiceRoleClient>
type Materials = { needLineup: boolean; needDetail: boolean; repairEmpty: boolean }

/** Read stored artifacts strictly. A successful supplier response is not a successful save. */
export async function readMaterialNeeds(db: DB, gameIds: string[]): Promise<Materials> {
  const [lineups, details] = await Promise.all([
    db.from("match_lineups").select("payload").in("game_id", gameIds),
    db.from("match_details_cache").select("payload,finished,updated_at").in("game_id", gameIds),
  ])
  if (lineups.error || details.error) {
    throw new Error(`materials-read:${lineups.error?.message ?? details.error?.message}`)
  }
  const confirmed = lineups.data?.some((row) => {
    const p = row.payload as {
      status?: string
      projected?: boolean
      kickoff?: string
      fetchedAt?: string
    } | null
    return (
      p?.status === "ready" &&
      lineupConfidence({ kickoff: p.kickoff, fetchedAt: p.fetchedAt, projected: p.projected }) ===
        "confirmed"
    )
  })
  const best = pickDetailsRow(details.data ?? [])
  const p = best?.payload as {
    finished?: boolean
    homeScore?: number | null
    awayScore?: number | null
    timeline?: unknown[]
  } | null
  const repairEmpty = !p?.timeline?.length
  return {
    needLineup: !confirmed,
    needDetail:
      !p?.finished || !Number.isFinite(p.homeScore) || !Number.isFinite(p.awayScore) || repairEmpty,
    repairEmpty,
  }
}

/** One recovery owner; existing thread/MOTM/report crons keep their own publication rules. */
export async function recoverMatchMaterials(fixtures: FixtureRow[], start = Date.now()) {
  const db = createServiceRoleClient()
  const now = Date.now()
  const errors: { gameId: string; reason: string }[] = []
  const fail = (gameId: string, error: unknown) =>
    errors.push({ gameId, reason: error instanceof Error ? error.message : String(error) })
  const candidates = new Map<
    string,
    { fixture: FixtureRow & { gameId: string }; gameIds: string[] }
  >()
  for (const f of fixtures) {
    const age = now - Date.parse(f.matchTime)
    if (
      !f.gameId ||
      !isMatchPageLeague(f.leagueCode) ||
      f.status === "cancelled" ||
      !(age > 4 * 3600_000 && age < 24 * 3600_000)
    )
      continue
    try {
      const identity = await getMatchIdentity(db, f.gameId, { strict: true })
      if (identity.lfaMatchId && f.lfaMatchId && identity.lfaMatchId !== f.lfaMatchId)
        throw new Error("materials-identity-conflict")
      const lfaId = identity.lfaMatchId ?? f.lfaMatchId
      if (!lfaId) throw new Error("materials-mapping-pending")
      if (!candidates.has(lfaId))
        candidates.set(lfaId, { fixture: { ...f, gameId: f.gameId }, gameIds: identity.gameIds })
    } catch (error) {
      fail(f.gameId, error)
    }
  }
  const attemptedAt = new Map<string, number>()
  const ids = [...candidates.keys()]
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("lfa_material_recovery_attempts")
      .select("lfa_match_id,attempted_at")
      .in("lfa_match_id", ids.slice(i, i + 100))
    if (error) throw new Error(`materials-attempt-read:${error.message}`)
    for (const row of data ?? []) attemptedAt.set(row.lfa_match_id, Date.parse(row.attempted_at))
  }
  const targets = [...candidates].sort(
    ([a], [b]) => (attemptedAt.get(a) ?? 0) - (attemptedAt.get(b) ?? 0) || a.localeCompare(b)
  )
  const refresh = createLfaRefreshSession()
  let attempted = 0,
    complete = 0,
    lineups = 0,
    details = 0,
    deferred = 0,
    pending = 0
  for (const [lfaId, { fixture: f, gameIds }] of targets) {
    if (attempted >= 24 || Date.now() - start >= 90_000) {
      deferred++
      continue
    }
    try {
      const before = await readMaterialNeeds(db, gameIds)
      if (!before.needLineup && !before.needDetail) {
        complete++
        continue
      }
      const { data: claimed, error } = await db.rpc("claim_lfa_material_recovery", {
        p_lfa_match_id: lfaId,
      })
      if (error) throw new Error(`materials-claim:${error.message}`)
      if (!claimed) {
        deferred++
        continue
      }
      attempted++
      // Try lineup first for event names, but its failure cannot block independent details.
      if (before.needLineup) {
        try {
          await getMatchLineup(f.gameId, { refresh: true })
        } catch (error) {
          fail(f.gameId, error)
        }
      }
      if (before.needDetail && Date.now() - start < 90_000) {
        try {
          await refresh(f, { repairEmpty: before.repairEmpty })
        } catch (error) {
          fail(f.gameId, error)
        }
      }
      const after = await readMaterialNeeds(db, gameIds)
      if (before.needLineup && !after.needLineup) lineups++
      if (before.needDetail && !after.needDetail) details++
      if (!after.needLineup && !after.needDetail) complete++
      else pending++
    } catch (error) {
      fail(f.gameId, error)
      pending++
    }
  }
  return {
    targets: targets.length,
    attempted,
    complete,
    lineups,
    details,
    deferred,
    pending,
    errors,
  }
}
