import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getReadMatchIdentity } from "@/lib/match/read-identity"

/** Archive-only read. Opening the match center never contacts the legacy report provider. */
export async function getStoredMatchReport(gameId: string) {
  const db = createServiceRoleClient()
  const { gameIds: ids } = await getReadMatchIdentity(gameId)
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
