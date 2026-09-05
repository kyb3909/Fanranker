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

export async function storeLfaLineup(gameId: string, matchId: string, payload: LineupResponse) {
  if (payload.status !== "ready" || typeof payload.projected !== "boolean") return
  const db = createServiceRoleClient()
  const row = {
    game_id: gameId,
    event_id: matchId,
    payload: { ...payload, source: "lfa", matchId },
    updated_at: payload.fetchedAt,
  }
  if (payload.projected) {
    // Insert only if absent, then update only a still-predicted row. A late prediction
    // must not overwrite a confirmed/legacy snapshot, including concurrent requests.
    const inserted = await db
      .from("match_lineups")
      .upsert(row, { onConflict: "game_id", ignoreDuplicates: true })
    if (inserted.error) throw new Error(`lineup-store:${inserted.error.code}`)
    const updated = await db
      .from("match_lineups")
      .update(row)
      .eq("game_id", gameId)
      .eq("payload->>projected", "true")
    if (updated.error) throw new Error(`lineup-store:${updated.error.code}`)
    return
  }
  const { error } = await db.from("match_lineups").upsert(row, { onConflict: "game_id" })
  if (error) throw new Error(`lineup-store:${error.code}`)
}
