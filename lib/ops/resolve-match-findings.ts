import type { createServiceRoleClient } from "@/lib/supabase/server"
import { getMatchIdentity } from "@/lib/match/sibling-ids"

type DB = ReturnType<typeof createServiceRoleClient>
export const MATCH_MISSING_FINDINGS = new Set([
  "match_thread_missing",
  "motm_poll_missing",
  "lfa_link_missing",
])
export type MissingMatchRef = { gameIds: string[]; pollKeys?: string[] }

export function missingMatchRefs(detail: Record<string, unknown>): MissingMatchRef[] {
  if (Array.isArray(detail.matches))
    return detail.matches.filter(
      (m): m is MissingMatchRef =>
        !!m &&
        typeof m === "object" &&
        Array.isArray(m.gameIds) &&
        m.gameIds.length > 0 &&
        m.gameIds.every((id: unknown) => typeof id === "string")
    )
  const ids = Array.isArray(detail.sibling_ids)
    ? detail.sibling_ids.filter((id): id is string => typeof id === "string")
    : []
  if (typeof detail.game_id === "string") ids.push(detail.game_id)
  return ids.length ? [{ gameIds: [...new Set(ids)] }] : []
}

/** An expired scan window is not evidence of repair. Check the original matches by ID. */
export async function missingMatchFindingResolved(
  db: DB,
  invariant: string,
  detail: Record<string, unknown>
): Promise<boolean> {
  const refs = missingMatchRefs(detail)
  // Legacy aggregate findings did not store IDs. Keep them open for an explicit decision.
  if (!refs.length) return false
  for (const ref of refs) {
    const identities = await Promise.all(
      ref.gameIds.map((id) => getMatchIdentity(db, id, { strict: true }))
    )
    const ids = [...new Set([...ref.gameIds, ...identities.flatMap((i) => i.gameIds)])]
    if (invariant === "lfa_link_missing") {
      if (!identities.some((i) => i.lfaMatchId)) return false
    } else if (invariant === "match_thread_missing") {
      const { data, error } = await db
        .from("posts")
        .select("id")
        .in("match_game_id", ids)
        .is("deleted_at", null)
        .limit(1)
      if (error) throw new Error(`missing-thread-recheck:${error.message}`)
      if (!data?.length) return false
    } else if (invariant === "motm_poll_missing") {
      const keys = [...new Set([...(ref.pollKeys ?? []), ...identities.flatMap((i) => i.pollKeys)])]
      const [byId, byKey] = await Promise.all([
        db.from("polls").select("id").in("game_id", ids).eq("kind", "motm").limit(1),
        keys.length
          ? db.from("polls").select("id").in("match_key", keys).eq("kind", "motm").limit(1)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (byId.error || byKey.error)
        throw new Error(`missing-motm-recheck:${byId.error?.message ?? byKey.error?.message}`)
      if (!byId.data?.length && !byKey.data?.length) return false
    } else return false
  }
  return true
}
