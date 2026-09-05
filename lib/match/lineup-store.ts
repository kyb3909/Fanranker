import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { pickLineupRow } from "@/lib/match/pick-sibling-row"
import type { LineupResponse } from "./lineup-types"

/** Never treat a legacy Soccerway snapshot as an LFA-confirmed roster. */
export async function loadStoredLfaLineup(
  gameId: string,
  matchId?: string
): Promise<LineupResponse | null> {
  const db = createServiceRoleClient()
  const ids = await getSiblingGameIds(db, gameId)
  const { data, error } = await db
    .from("match_lineups")
    .select("game_id,event_id,payload,updated_at")
    .in("game_id", ids)
  if (error) throw new Error(`lineup-read:${error.code}`)
  const rows = (data ?? []) as {
    game_id: string
    event_id: string
    payload: LineupResponse
    updated_at: string
  }[]
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
  if (payload.status !== "ready" || payload.projected !== false) return
  const { error } = await createServiceRoleClient()
    .from("match_lineups")
    .upsert(
      {
        game_id: gameId,
        event_id: matchId,
        payload: { ...payload, source: "lfa", matchId },
        updated_at: payload.fetchedAt,
      },
      { onConflict: "game_id" }
    )
  if (error) throw new Error(`lineup-store:${error.code}`)
}
