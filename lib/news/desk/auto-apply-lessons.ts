import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { anchoredLessons } from "./evidence"
import { ArticleSchema, LessonProposalSchema, type DeskLesson, type DeskRevision } from "./types"

/** Saved edits to real articles are the owner's approval; reuse requires no second click. */
export async function applyPendingDeskLessons(db: SupabaseClient, revisionId?: string) {
  let query = db
    .from("news_desk_lessons")
    .select("*")
    .eq("review_status", "pending")
    .eq("active", false)
  if (revisionId) query = query.eq("revision_id", revisionId)
  const pending = await query.order("created_at", { ascending: true }).limit(120)
  if (pending.error) throw Error("교정 지침의 자동 반영 상태를 불러오지 못했습니다.")
  const lessons = (pending.data ?? []) as DeskLesson[]
  const result = { applied: 0, excluded: 0 }
  if (!lessons.length) return result
  const revisions = await db
    .from("news_desk_revisions")
    .select("*")
    .in("id", [...new Set(lessons.map((lesson) => lesson.revision_id))])
    .eq("learning_state", "ready")
  if (revisions.error) throw Error("교정 지침의 수정 기록을 불러오지 못했습니다.")
  const ready = (revisions.data ?? []) as DeskRevision[]
  if (!ready.length) return result
  const items = await db
    .from("news_desk_items")
    .select("id,origin")
    .in("id", [...new Set(ready.map((revision) => revision.item_id))])
    .not("origin", "is", null)
  if (items.error) throw Error("교정 지침의 실제 기사 연결을 확인하지 못했습니다.")
  const real = new Set((items.data ?? []).map((item) => item.id))
  const byId = new Map(
    ready
      .filter((revision) => real.has(revision.item_id))
      .map((revision) => [revision.id, revision])
  )
  for (const lesson of lessons) {
    const revision = byId.get(lesson.revision_id)
    if (!revision) continue
    const before = ArticleSchema.safeParse(revision.before_draft)
    const after = ArticleSchema.safeParse(revision.after_draft)
    const proposal = LessonProposalSchema.safeParse(lesson)
    const anchored =
      before.success && after.success && proposal.success
        ? anchoredLessons([proposal.data], before.data, after.data, revision.editor_reason)[0]
        : undefined
    const changed = await db
      .from("news_desk_lessons")
      .update({
        active: Boolean(anchored),
        review_status: "reviewed",
        ...(anchored
          ? { instruction: anchored.instruction, scope: anchored.scope }
          : {
              explanation:
                `${lesson.explanation}\n자동 반영 제외: 저장된 수정 전후에서 실제 변경 구절을 확인하지 못했습니다.`.slice(
                  0,
                  2000
                ),
            }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lesson.id)
      .eq("review_status", "pending")
      .eq("active", false)
      .eq("updated_at", lesson.updated_at)
      .select("id")
      .maybeSingle()
    if (changed.error)
      throw Error("교정 지침 자동 반영을 완료하지 못했습니다. 다음 실행에서 다시 시도합니다.")
    // Preserve a human's concurrent revision or explicit disable.
    if (changed.data) result[anchored ? "applied" : "excluded"]++
  }
  return result
}
