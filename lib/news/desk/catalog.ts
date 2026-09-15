import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { material, type LiveArticleRef } from "./live-articles"
import type { SourceRow } from "./evidence"

export const CatalogQuery = z.object({
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "drafted", "published", "rejected", "deleted", "archived"]).default("all"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})
export async function listDeskCatalog(db: SupabaseClient, input: z.infer<typeof CatalogQuery>) {
  const limit = 30
  let query = db.from("news_desk_catalog").select("*", { count: "exact" })
  if (input.status !== "all") query = query.eq("status", input.status)
  // PostgREST's ilike treats * as %, so escape both forms of wildcards.
  if (input.q) query = query.ilike("title", `%${input.q.replace(/[\\%_*]/g, "\\$&")}%`)
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("kind")
    .order("id")
    .range((input.page - 1) * limit, input.page * limit - 1)
  if (error) throw Error("기사 목록을 불러오지 못했습니다.")
  return { items: data ?? [], total: count ?? 0, page: input.page, limit }
}

export async function openDeskArticle(db: SupabaseClient, ref: LiveArticleRef, actor: string) {
  const catalog = await db
    .from("news_desk_catalog")
    .select("source_id")
    .eq("kind", ref.kind)
    .eq("id", ref.id)
    .maybeSingle()
  if (catalog.error || !catalog.data) throw Error("데스킹할 기사를 찾을 수 없습니다.")
  let sources: ReturnType<typeof material> = []
  if (catalog.data.source_id) {
    const source = await db
      .from("news_reservoir")
      .select("id,created_at,urls,raw,draft")
      .eq("id", catalog.data.source_id)
      .single()
    if (source.error) throw Error("저장된 원문 자료를 불러오지 못했습니다.")
    const row = source.data
    sources = material({
      ...row,
      raw: {
        ...row.raw,
        source_text: row.raw?.source_text || row.raw?.articleText || row.raw?.excerpt,
      },
    } as SourceRow)
  }
  const { data, error } = await db.rpc("open_news_desk_article", {
    p_kind: ref.kind,
    p_origin_id: ref.id,
    p_sources: sources,
    p_actor: actor,
  })
  if (error)
    throw Error(
      error.code === "22023"
        ? "편집 가능한 기사 범위는 제목 2~300자, 본문 20~8,000자입니다."
        : "기사를 열지 못했습니다. 다시 시도해 주세요."
    )
  return data as { id: string; existing: boolean }
}
