import { NextRequest, NextResponse } from "next/server"
import { createAnonClient, createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"
import { z } from "zod"

const patchPostSchema = z.object({
  community_slug: z.string().optional(),
  title: z.string().optional(),
  content: z.any().optional(),
  image: z.string().nullable().optional(),
  flair_id: z.string().uuid().nullable().optional(),
})

/**
 * GET /api/posts/[id]
 * 특정 글 상세 조회
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAnonClient()

    // 1. 게시글 조회
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select(
        `
        id,
        user_id,
        community_slug,
        title,
        content,
        image,
        vote_count,
        comment_count,
        temperature,
        created_at,
        updated_at
      `
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (postError) {
      return apiError("글을 찾을 수 없습니다.", 404, postError)
    }

    if (!post) {
      return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 })
    }

    // 2. 작성자 프로필 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .eq("user_id", post.user_id)
      .single()

    const res = NextResponse.json({
      post: {
        ...post,
        profile: profile || null,
      },
    })
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * PATCH /api/posts/[id]
 * 글 수정 (작성자만)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await currentUser()
    if (!user?.id) {
      return apiUnauthorized()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = patchPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { community_slug, title, content, image, flair_id } = parsed.data

    const supabase = createServiceRoleClient()
    const { data: existing } = await supabase.from("posts").select("user_id").eq("id", id).single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (community_slug != null) updates.community_slug = community_slug
    if (title != null) updates.title = title
    if (content != null) updates.content = content
    if (image !== undefined) updates.image = image
    if (flair_id !== undefined) updates.flair_id = flair_id

    if (updates.image === undefined && content != null) {
      const { extractFirstImageSrcFromTipTapJSON } = await import("@/lib/utils/tiptap-embeds")
      const thumb = extractFirstImageSrcFromTipTapJSON(content)
      if (thumb) updates.image = thumb
    }

    const { data, error } = await supabase
      .from("posts")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return apiError("게시글 수정에 실패했습니다.", 500, error)
    }
    return NextResponse.json(data)
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * DELETE /api/posts/[id]
 * 글 삭제 (작성자만, 소프트 삭제)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await currentUser()
    if (!user?.id) {
      return apiUnauthorized()
    }

    const supabase = createServiceRoleClient()
    const { data: existing } = await supabase.from("posts").select("user_id").eq("id", id).single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 })
    }

    const { error } = await supabase
      .from("posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      return apiError("게시글 삭제에 실패했습니다.", 500, error)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
