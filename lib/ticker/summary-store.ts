import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  summarizePost,
  summaryContentHash,
  postPlainText,
  type PostSummary,
} from "./summarize-post"
import { stripSourcePrefix } from "@/lib/feed/source-rules"

export interface SummarizablePost {
  id: string
  title: string
  content: unknown
  source_url: string | null
  source_name: string | null
}

export interface SummaryRunResult {
  candidates: number
  made: number
  skipped: number
  failed: { postId: string; reason: string }[]
}

/**
 * 요약이 없거나 본문이 바뀐 글만 새로 만든다. 한 번에 `limit` 건 — LLM 호출이라 예산을 건다.
 * 실패한 글은 다음 실행에서 다시 시도된다(원장 없음 — 요약은 있으면 좋은 부속물이다).
 */
export async function fillMissingSummaries(
  db: SupabaseClient,
  posts: SummarizablePost[],
  opts: { limit?: number; apply?: boolean; force?: boolean } = {}
): Promise<SummaryRunResult & { previews: PostSummary[] }> {
  const limit = opts.limit ?? 20
  const ids = posts.map((p) => p.id)
  const { data: existing, error } = ids.length
    ? await db.from("post_summaries").select("post_id, content_hash").in("post_id", ids)
    : { data: [], error: null }
  if (error) throw new Error(`post_summaries read: ${error.message}`)
  const current = new Map((existing ?? []).map((r) => [String(r.post_id), String(r.content_hash)]))

  const result: SummaryRunResult & { previews: PostSummary[] } = {
    candidates: 0,
    made: 0,
    skipped: 0,
    failed: [],
    previews: [],
  }
  for (const post of posts) {
    if (result.candidates >= limit) break
    const text = postPlainText(post.content)
    const hash = summaryContentHash(stripSourcePrefix(post.title).title, text)
    if (!opts.force && current.get(post.id) === hash) {
      result.skipped++
      continue
    }
    result.candidates++
    const summary = await summarizePost({
      postId: post.id,
      title: post.title,
      content: post.content,
      sourceUrl: post.source_url,
      sourceName: post.source_name,
    })
    if (!summary) {
      result.failed.push({ postId: post.id, reason: "no-summary" })
      continue
    }
    result.previews.push(summary)
    if (!opts.apply) continue
    const { error: upsertError } = await db.from("post_summaries").upsert(
      {
        post_id: summary.postId,
        lines: summary.lines,
        kind: summary.kind,
        source_name: summary.sourceName,
        model: summary.model,
        content_hash: summary.contentHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id" }
    )
    if (upsertError) result.failed.push({ postId: post.id, reason: upsertError.message })
    else result.made++
  }
  return result
}
