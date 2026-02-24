import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const followActionSchema = z.object({
  action: z.enum(["follow", "unfollow"]).optional(),
})

/**
 * POST /api/users/[id]/follow
 *
 * Follow or unfollow a user
 *
 * Body:
 * - action?: "follow" | "unfollow" (default: "follow" - toggles if already following)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id
    const { id: followedUserId } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const parsed = followActionSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { action } = parsed.data

    if (!followedUserId) {
      return NextResponse.json({ error: "사용자 ID가 필요합니다." }, { status: 400 })
    }

    if (userId === followedUserId) {
      return NextResponse.json({ error: "자기 자신을 팔로우할 수 없습니다." }, { status: 400 })
    }

    // Check if already following
    const { data: existingFollow, error: checkError } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", userId)
      .eq("followed_user_id", followedUserId)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      return apiError("팔로우 상태 확인 중 오류가 발생했습니다.", 500, checkError)
    }

    const isFollowing = !!existingFollow

    // Determine action
    let shouldFollow: boolean
    if (action === "unfollow") {
      shouldFollow = false
    } else if (action === "follow") {
      shouldFollow = true
    } else {
      // Toggle: follow if not following, unfollow if following
      shouldFollow = !isFollowing
    }

    if (shouldFollow && !isFollowing) {
      // Follow
      const { error: insertError } = await supabase.from("user_follows").insert({
        follower_id: userId,
        followed_user_id: followedUserId,
      })

      if (insertError) {
        return apiError("팔로우 중 오류가 발생했습니다.", 500, insertError)
      }

      return NextResponse.json({ success: true, following: true })
    } else if (!shouldFollow && isFollowing) {
      // Unfollow
      const { error: deleteError } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", userId)
        .eq("followed_user_id", followedUserId)

      if (deleteError) {
        return apiError("언팔로우 중 오류가 발생했습니다.", 500, deleteError)
      }

      return NextResponse.json({ success: true, following: false })
    } else {
      // Already in desired state
      return NextResponse.json({ success: true, following: shouldFollow })
    }
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * GET /api/users/[id]/follow
 *
 * Check if current user is following the specified user
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ following: false })
    }

    const userId = user.id
    const { id: followedUserId } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    const { data: existingFollow, error } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", userId)
      .eq("followed_user_id", followedUserId)
      .single()

    if (error && error.code !== "PGRST116") {
      console.error("Failed to check follow status:", error)
      return NextResponse.json({ following: false })
    }

    return NextResponse.json({ following: !!existingFollow })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ following: false })
  }
}
