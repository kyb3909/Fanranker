import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/supabase/admin"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"

export const dynamic = "force-dynamic"

/** 발행 뉴스 작성자 = 공놀이봇(user_bot_soccer_kr). football 게시판. 봇 글은 전부 이 계정. */
const NEWS_BOT_USER_ID = "user_bot_soccer_kr"
const FOOTBALL_CATEGORY_ID = "22105623-6c99-487d-975f-15073e0990fc"
const FOOTBALL_SLUG = "football"

/**
 * POST /api/admin/news-review  — 관리자 전용 (admin layout + requireAdmin 이중 보호).
 * body: { id, action: "publish" | "reject" | "save", title?, content? }
 *  - publish: news_reservoir(drafted) → posts 발행(공놀이봇) + reservoir status=published
 *  - save   : 검수 중 수정본을 draft 에 저장 (발행 안 함)
 *  - reject : reservoir status=rejected (발행 안 함)
 *  - title/content 가 오면(검수 편집) 그 수정본으로 저장/발행한다.
 */
const BodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(["publish", "reject", "save"]),
  title: z.string().min(1).max(300).optional(),
  content: z.unknown().optional(),
})

interface DraftReservoirRow {
  id: string
  status: string
  urls: { source?: string | null } | null
  draft: { title?: string; content?: unknown; tags?: string[] } | null
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "id/action 필요" }, { status: 400 })
  const { id, action, title: editTitle, content: editContent } = parsed.data

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  const { data: item } = await supabase
    .from("news_reservoir")
    .select("id, status, urls, draft")
    .eq("id", id)
    .maybeSingle<DraftReservoirRow>()
  if (!item) return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 })
  if (item.status !== "drafted") {
    return NextResponse.json(
      { error: `이미 처리된 초안입니다 (status=${item.status}).` },
      { status: 409 }
    )
  }

  if (action === "reject") {
    await supabase
      .from("news_reservoir")
      .update({ status: "rejected", updated_at: now })
      .eq("id", id)
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // save/publish 공통 — 검수 편집본(title/content)이 오면 그걸, 아니면 기존 draft 사용
  const finalTitle = (editTitle ?? item.draft?.title)?.trim()
  const finalContent = sanitizeTipTapJSON(editContent ?? item.draft?.content)
  if (!finalTitle || !finalContent) {
    return NextResponse.json({ error: "제목/본문이 유효하지 않습니다." }, { status: 400 })
  }
  const nextDraft = { ...(item.draft ?? {}), title: finalTitle, content: finalContent }

  // 수정 저장만 (발행 안 함)
  if (action === "save") {
    await supabase.from("news_reservoir").update({ draft: nextDraft, updated_at: now }).eq("id", id)
    return NextResponse.json({ ok: true, status: "drafted", saved: true })
  }

  // publish
  const image = extractFirstImageSrcFromTipTapJSON(finalContent)
  const sourceUrl = item.urls?.source ?? null

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      user_id: NEWS_BOT_USER_ID,
      category_id: FOOTBALL_CATEGORY_ID,
      community_slug: FOOTBALL_SLUG,
      title: finalTitle,
      content: finalContent,
      ...(image ? { image } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
    })
    .select("id")
    .single<{ id: string }>()
  if (postErr || !post) {
    return NextResponse.json({ error: "발행 실패", detail: postErr?.message }, { status: 500 })
  }

  await supabase
    .from("news_reservoir")
    .update({
      status: "published",
      publish: { post_id: post.id, published_at: now },
      draft: nextDraft,
      updated_at: now,
    })
    .eq("id", id)

  return NextResponse.json({ ok: true, status: "published", post_id: post.id })
}
