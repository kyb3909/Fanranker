import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { DeskArticle } from "./types"

/** Human edits are usable immediately; inferred AI rules have their own review lifecycle. */
export async function loadCorrectionCases(db: SupabaseClient) {
  const { data, error } = await db
    .from("news_desk_revisions")
    .select("id,item_id,before_draft,after_draft,editor_reason,created_at")
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) throw Error("교정 사례를 불러오지 못했습니다.")
  const seen = new Set<string>()
  return (data ?? [])
    .flatMap((row) => {
      const before = row.before_draft as DeskArticle | null
      const after = row.after_draft as DeskArticle | null
      if (!before || !after || seen.has(row.item_id)) return []
      // Include title-only edits too. Never use a status-only revision as a correction.
      if (before.title === after.title && before.article === after.article) return []
      seen.add(row.item_id)
      return [
        {
          revision_id: row.id as string,
          beforeTitle: before.title,
          before: before.article.slice(0, 700),
          afterTitle: after.title,
          after: after.article.slice(0, 1200),
          reason: row.editor_reason as string,
        },
      ]
    })
    .slice(0, 2)
}
