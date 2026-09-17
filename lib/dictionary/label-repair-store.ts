import type { SupabaseClient } from "@supabase/supabase-js"
import { isDeepStrictEqual } from "node:util"
import { assertLabelOnly, type LabelDecision } from "./relocalize-labels"

export interface LabelRepairPatch {
  table: "match_lineups" | "polls"
  id: string
  before: unknown
  after: unknown
  changes: LabelDecision[]
}

/** Compare the entire original JSON atomically. A concurrent roster/option edit wins. */
export async function applyLabelRepair(db: SupabaseClient, patch: LabelRepairPatch) {
  assertLabelOnly(patch.before, patch.after, patch.changes)
  const pk = patch.table === "polls" ? "id" : "game_id"
  const column = patch.table === "polls" ? "options" : "payload"
  let q = db
    .from(patch.table)
    .update({ [column]: patch.after })
    .eq(pk, patch.id)
    .eq(column, JSON.stringify(patch.before))
  if (patch.table === "polls") q = q.eq("kind", "motm")
  const { data, error } = await q.select(pk)
  if (error || !data) throw new Error(`Repair write failed: ${error?.message ?? "no row data"}`)
  if (data.length === 0) return "conflict" as const
  if (data.length !== 1) throw new Error("Unexpected updated row count")
  const verify = await db.from(patch.table).select(column).eq(pk, patch.id).single()
  if (
    verify.error ||
    !isDeepStrictEqual((verify.data as unknown as Record<string, unknown>)?.[column], patch.after)
  )
    throw new Error("Repair verification failed after write; inspect journal before retrying")
  return "applied" as const
}
