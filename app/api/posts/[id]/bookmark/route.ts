import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"
import { z } from "zod"

/**
 * POST /api/posts/[id]/bookmark
 *
 * Toggle bookmark for a post (add if not bookmarked, remove if bookmarked)
 *
 * Body:
 * - action?: "add" | "remove" (default: toggle)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id
    const { id: postId } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()
    // 빈 본문 허용 — 토글 호출은 본문 없이 POST 된다 (action 은 optional).
    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const BookmarkSchema = z.object({ action: z.enum(["add", "remove"]).optional() })
    const parsed = BookmarkSchema.safeParse(body)
    const action = parsed.success ? parsed.data.action : undefined

    // Check if post exists
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 })
    }

    // Check if bookmark exists
    const { data: existingBookmark, error: checkError } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      return apiError("북마크 상태 확인 중 오류가 발생했습니다.", 500, checkError)
    }

    const isBookmarked = !!existingBookmark

    // Determine action
    let shouldBookmark: boolean
    if (action === "remove") {
      shouldBookmark = false
    } else if (action === "add") {
      shouldBookmark = true
    } else {
      // Toggle: bookmark if not bookmarked, remove if bookmarked
      shouldBookmark = !isBookmarked
    }

    if (shouldBookmark && !isBookmarked) {
      // Add bookmark
      const { error: insertError } = await supabase.from("bookmarks").insert({
        user_id: userId,
        post_id: postId,
      })

      if (insertError) {
        return apiError("북마크 추가 중 오류가 발생했습니다.", 500, insertError)
      }

      return NextResponse.json({ success: true, bookmarked: true })
    } else if (!shouldBookmark && isBookmarked) {
      // Remove bookmark
      const { error: deleteError } = await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId)

      if (deleteError) {
        return apiError("북마크 제거 중 오류가 발생했습니다.", 500, deleteError)
      }

      return NextResponse.json({ success: true, bookmarked: false })
    } else {
      // Already in desired state
      return NextResponse.json({ success: true, bookmarked: shouldBookmark })
    }
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * GET /api/posts/[id]/bookmark
 *
 * Check if current user has bookmarked the post
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ bookmarked: false })
    }

    const userId = user.id
    const { id: postId } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()

    const { data: bookmark, error } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .single()

    if (error && error.code !== "PGRST116") {
      console.error("Failed to check bookmark status:", error)
      return NextResponse.json({ bookmarked: false })
    }

    return NextResponse.json({ bookmarked: !!bookmark })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ bookmarked: false })
  }
}
