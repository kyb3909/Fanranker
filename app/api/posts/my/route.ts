import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/posts/my
 *
 * Get current user's posts
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()

    // Fetch user's posts
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        `
        id,
        user_id,
        community_slug,
        title,
        content,
        image,
        view_count,
        vote_count,
        comment_count,
        temperature,
        created_at
      `
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (postsError) {
      return apiError("글 목록을 가져오는 중 오류가 발생했습니다.", 500, postsError)
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .eq("user_id", userId)
      .single()

    return NextResponse.json({
      posts: posts || [],
      profiles: profile ? [profile] : [],
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
