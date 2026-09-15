import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"
import { ArticleSchema, SourceSchema, type DeskSource } from "./types"
import { sourceIdentity, type SourceRow } from "./evidence"

export const LiveArticleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post"), id: z.string().uuid() }),
  z.object({ kind: z.literal("draft"), id: z.string().min(1).max(200) }),
])
export type LiveArticleRef = z.infer<typeof LiveArticleSchema>

/** Keep paragraph boundaries and inline text; images/embeds never become training prose. */
export function deskArticleText(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const node = value as { type?: string; text?: string; content?: unknown[] }
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  const body = (node.content ?? []).map(deskArticleText).join("")
  return ["paragraph", "heading", "blockquote", "listItem"].includes(node.type ?? "")
    ? body + "\n\n"
    : body
}

export async function listLiveArticles(db: SupabaseClient, q: string) {
  const results = await Promise.all([
    db
      .from("posts")
      .select("id,title,created_at")
      .eq("user_id", NEWS_BOT_USER_ID)
      .eq("community_slug", "football")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
    db
      .from("news_reservoir")
      .select("id,draft,raw,created_at")
      .eq("status", "drafted")
      .filter("source->>type", "eq", "hermes")
      .order("created_at", { ascending: false })
      .limit(80),
  ])
  if (results.some((r) => r.error)) throw Error("현재 기사 목록을 불러오지 못했습니다.")
  const query = q.toLocaleLowerCase()
  return [
    ...(results[0].data ?? []).map((r) => ({
      kind: "post" as const,
      id: r.id,
      title: r.title,
      created_at: r.created_at,
    })),
    ...(results[1].data ?? [])
      .filter((r) => r.raw?.sport !== "basketball" && r.draft?.title)
      .map((r) => ({
        kind: "draft" as const,
        id: r.id,
        title: r.draft.title as string,
        created_at: r.created_at,
      })),
  ]
    .filter((r) => r.title.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 80)
}

export function material(row: SourceRow | null): DeskSource[] {
  if (!row?.urls?.source || !/^https?:\/\//i.test(row.urls.source)) return []
  try {
    new URL(row.urls.source)
  } catch {
    return []
  }
  const text = row.raw?.source_text?.replace(/^\[[^\]]+\]\s*/, "").trim()
  if (!text || text.length < 80 || /access denied|verify you are human/i.test(text)) return []
  const published = row.raw?.published_at
  const parsed = SourceSchema.safeParse({
    id: row.id,
    source_url: row.urls.source,
    title: row.raw?.original_title ?? row.draft?.title ?? "",
    ...sourceIdentity(row.urls.source, text),
    published_at:
      published && Number.isFinite(Date.parse(published))
        ? new Date(published).toISOString()
        : null,
    updated_at: null,
    author: null,
    role: "current",
    captured_at: row.raw?.evidence?.captured_at ?? row.created_at,
    text: text.slice(0, 24000),
  })
  return parsed.success ? [parsed.data] : []
}

export async function importLiveArticle(db: SupabaseClient, ref: LiveArticleRef, actor: string) {
  let title: string, content: unknown, source: SourceRow | null
  if (ref.kind === "post") {
    const post = await db
      .from("posts")
      .select("title,content")
      .eq("id", ref.id)
      .eq("user_id", NEWS_BOT_USER_ID)
      .eq("community_slug", "football")
      .is("deleted_at", null)
      .maybeSingle()
    if (post.error) throw Error("기사 본문을 불러오지 못했습니다.")
    if (!post.data) throw Error("데스킹할 축구 기사를 찾을 수 없습니다.")
    title = post.data.title
    content = post.data.content
    const original = await db
      .from("news_reservoir")
      .select("id,created_at,urls,raw,draft")
      .or(`publish->>post_id.eq.${ref.id},publish->>postId.eq.${ref.id}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (original.error) throw Error("저장된 원문 자료를 불러오지 못했습니다.")
    source = original.data as SourceRow | null
  } else {
    const draft = await db
      .from("news_reservoir")
      .select("id,created_at,urls,raw,draft")
      .eq("id", ref.id)
      .eq("status", "drafted")
      .filter("source->>type", "eq", "hermes")
      .maybeSingle()
    if (draft.error) throw Error("대기 기사 본문을 불러오지 못했습니다.")
    if (!draft.data || draft.data.raw?.sport === "basketball")
      throw Error("데스킹할 축구 기사를 찾을 수 없습니다.")
    title = draft.data.draft?.title ?? ""
    content = draft.data.draft?.content
    source = draft.data as SourceRow
  }
  const draft = ArticleSchema.safeParse({ title, article: deskArticleText(content).trim() })
  if (!draft.success)
    throw Error(
      "학습 편집 범위를 벗어난 기사입니다. 제목 2~300자·본문 20~8,000자 범위의 기사를 선택해 주세요."
    )
  const { data, error } = await db.rpc("import_news_desk_article", {
    p_kind: ref.kind,
    p_origin_id: ref.id,
    p_draft: draft.data,
    p_sources: material(source),
    p_actor: actor,
  })
  if (error) throw Error("기사를 작업함에 저장하지 못했습니다.")
  return data as { id: string; existing: boolean }
}
