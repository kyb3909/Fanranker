/**
 * /design-preview — 담벼락 디자인 개선안 프리뷰 (실제 게시물 데이터 연결)
 *
 * ⚠️ 실제 담벼락(components/home/*, post-card*)·프로덕션 피드와 무관한 독립 프리뷰.
 * 데이터만 실제 DB(최근 인기 게시물)에서 읽어 개선안/현재 디자인에 붙인다.
 * GNB 미노출 — 직접 URL(/design-preview)로만 접근.
 */

import { createAnonClient } from "@/lib/supabase/server"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import { formatRelativeTime } from "@/lib/utils/date"
import {
  extractFirstImageSrcFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"
import { PreviewClient, type PreviewPost, type PreviewMedia } from "./preview-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "담벼락 디자인 프리뷰", robots: { index: false } }

function deriveMedia(content: unknown, image: string | null): PreviewMedia | undefined {
  if (typeof content === "string") {
    return image ? { kind: "image", src: image } : undefined
  }
  const img = extractFirstImageSrcFromTipTapJSON(content) || image
  if (img) return { kind: "image", src: img }
  const embed = extractFirstEmbedFromTipTapJSON(content)
  if (embed) {
    return {
      kind: "link",
      provider: embed.attrs.provider,
      url: embed.attrs.url,
      thumb: embed.attrs.thumbnail_url,
    }
  }
  return undefined
}

export default async function DesignPreviewPage() {
  const supabase = createAnonClient()

  const { data: activeCats } = await supabase
    .from("categories")
    .select("slug")
    .eq("is_active", true)
  const activeSlugs = (activeCats ?? []).map((c) => c.slug)

  const { data: rows } = await supabase
    .from("posts")
    .select(
      "id, user_id, community_slug, title, content, image, vote_count, comment_count, view_count, temperature, created_at, post_flairs ( name )"
    )
    .is("deleted_at", null)
    .in("community_slug", activeSlugs.length ? activeSlugs : ["football"])
    .order("temperature", { ascending: false, nullsFirst: false })
    .limit(8)

  const posts = rows ?? []
  const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))]
  const { data: profs } = userIds.length
    ? await supabase.from("profiles").select("user_id, nickname").in("user_id", userIds)
    : { data: [] as { user_id: string; nickname: string }[] }
  const nickById = new Map((profs ?? []).map((p) => [p.user_id, p.nickname]))

  const temps = posts.map((p) => p.temperature ?? 0)
  const hotThreshold = temps.length ? Math.max(...temps) * 0.6 : Infinity

  const preview: PreviewPost[] = posts.map((p) => {
    const flair = (p.post_flairs as { name?: string } | null)?.name ?? undefined
    const body =
      typeof p.content === "string" ? p.content : extractTextFromTipTapJSON(p.content as never)
    return {
      id: String(p.id),
      sport: COMMUNITY_NAMES[p.community_slug] ?? p.community_slug,
      team: flair,
      author: nickById.get(p.user_id) ?? "익명",
      flair,
      time: formatRelativeTime(new Date(p.created_at as string)),
      title: p.title ?? "(제목 없음)",
      body: (body || "").replace(/\s+/g, " ").trim().slice(0, 160),
      media: deriveMedia(p.content, p.image as string | null),
      votes: p.vote_count ?? 0,
      comments: p.comment_count ?? 0,
      views: p.view_count ?? 0,
      hot: (p.temperature ?? 0) >= hotThreshold && (p.temperature ?? 0) > 0,
    }
  })

  return <PreviewClient posts={preview} />
}
