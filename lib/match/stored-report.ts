import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"

/** Archive-only read. Opening the match center never contacts the legacy report provider. */
export async function getStoredMatchReport(gameId: string) {
  const db = createServiceRoleClient()
  const ids = await getSiblingGameIds(db, gameId)
  const { data, error } = await db
    .from("match_reports")
    .select("title, paragraphs")
    .in("game_id", ids)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`match-report-read:${error.code}`)
  return data as { title: string; paragraphs: string[] } | null
}
