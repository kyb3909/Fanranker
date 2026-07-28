import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/bookmarks
 *
 * Get current user's bookmarked posts
 *
 * Query Parameters:
 * - limit?: number (default: 20)
 * - offset?: number (default: 0)
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
    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams, { def: 20, max: 50 })
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // Get bookmarks with post data
    const { data: bookmarks, error } = await supabase
      .from("bookmarks")
      .select(
        `
        id,
        created_at,
        post:posts!inner(
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
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return apiError("북마크를 가져오는 중 오류가 발생했습니다.", 500, error)
    }

    // Get user profiles for posts
    if (bookmarks && bookmarks.length > 0) {
      // Supabase types inner-join as array but it's a single object at runtime
      const userIds = [
        ...new Set(
          bookmarks
            .map((b) => {
              const post = b.post as unknown as { user_id: string } | null
              return post?.user_id
            })
            .filter(Boolean)
        ),
      ]
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .in("user_id", userIds)

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

      // Add profile data to posts
      // Supabase types inner-join as array but it's a single object at runtime
      const bookmarksWithProfiles = bookmarks.map((bookmark) => {
        const post = bookmark.post as unknown as Record<string, unknown> | null
        return {
          ...bookmark,
          post: post
            ? {
                ...post,
                profile: profileMap.get(post.user_id as string) || null,
              }
            : null,
        }
      })

      return NextResponse.json({ bookmarks: bookmarksWithProfiles })
    }

    return NextResponse.json({ bookmarks: [] })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
