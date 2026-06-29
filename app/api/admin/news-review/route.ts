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
 * body: { id, action: "publish" | "reject" }
 *  - publish: news_reservoir(drafted) → posts 발행(풋볼매니아_kr) + reservoir status=published
 *  - reject : reservoir status=rejected (발행 안 함)
 */
const BodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(["publish", "reject"]),
})

interface DraftReservoirRow {
  id: string
  status: string
  urls: { source?: string | null } | null
  draft: { title?: string; content?: unknown } | null
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
  const { id, action } = parsed.data

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

  // publish
  const title = item.draft?.title?.trim()
  const content = sanitizeTipTapJSON(item.draft?.content)
  if (!title || !content) {
    return NextResponse.json({ error: "초안 제목/본문이 유효하지 않습니다." }, { status: 400 })
  }
  const image = extractFirstImageSrcFromTipTapJSON(content)
  const sourceUrl = item.urls?.source ?? null

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      user_id: NEWS_BOT_USER_ID,
      category_id: FOOTBALL_CATEGORY_ID,
      community_slug: FOOTBALL_SLUG,
      title,
      content,
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
      updated_at: now,
    })
    .eq("id", id)

  return NextResponse.json({ ok: true, status: "published", post_id: post.id })
}
