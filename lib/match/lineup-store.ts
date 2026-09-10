import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { pickLineupRow } from "@/lib/match/pick-sibling-row"
import type { LineupResponse } from "./lineup-types"
import { lineupConfidence } from "./lineup-confidence"

async function readLineupRows(gameId: string) {
  const db = createServiceRoleClient()
  const ids = await getSiblingGameIds(db, gameId)
  const { data, error } = await db
    .from("match_lineups")
    .select("game_id,event_id,payload,updated_at")
    .in("game_id", ids)
  if (error) throw new Error(`lineup-read:${error.code}`)
  return (data ?? []) as {
    game_id: string
    event_id: string
    payload: LineupResponse
    updated_at: string
  }[]
}

/** Preserve historical snapshots regardless of provider. Reading archives never calls Soccerway. */
export async function loadStoredLineup(gameId: string): Promise<LineupResponse | null> {
  const rows = (await readLineupRows(gameId)).filter((r) => r.payload?.status === "ready")
  const confirmed = rows.filter(
    (r) => r.payload.status === "ready" && lineupConfidence(r.payload) === "confirmed"
  )
  const candidates = confirmed.length ? confirmed : rows
  const lfa = candidates.filter((r) => r.payload.status === "ready" && r.payload.source === "lfa")
  const best = pickLineupRow(lfa.length ? lfa : candidates)
  if (!best || best.payload.status !== "ready") return null
  // Use the same existing legacy confidence policy as the badge; do not relabel its provider.
  return best.payload.projected == null
    ? { ...best.payload, projected: lineupConfidence(best.payload) === "predicted" }
    : best.payload
}

/** Strict provenance selector retained for callers that explicitly require an LFA match ID. */
export async function loadStoredLfaLineup(
  gameId: string,
  matchId?: string
): Promise<LineupResponse | null> {
  const rows = await readLineupRows(gameId)
  const best = pickLineupRow(
    rows.filter(
      (r) =>
        r.payload?.status === "ready" &&
        r.payload.projected === false &&
        (r.payload.source === "lfa" || (matchId != null && r.event_id === matchId)) &&
        (!matchId || r.event_id === matchId)
    )
  )
  return best?.payload ?? null
}

export async function storeLfaLineup(
  gameId: string,
  matchId: string,
  payload: LineupResponse
): Promise<LineupResponse | null> {
  if (payload.status !== "ready" || typeof payload.projected !== "boolean") return null
  const db = createServiceRoleClient()
  const ids = await getSiblingGameIds(db, gameId, { strict: true })
  const { data, error } = await db.rpc("write_lfa_lineup_snapshot", {
    p_game_ids: ids,
    p_match_id: matchId,
    p_payload: { ...payload, source: "lfa", matchId } as never,
  })
  if (error) throw new Error(`lineup-store:${error.code}`)
  const result = data as { payload?: LineupResponse } | null
  if (!result?.payload) throw new Error("lineup-store:empty")
  return result.payload
}
