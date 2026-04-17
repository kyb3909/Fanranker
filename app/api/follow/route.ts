import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

/**
 * GET /api/follow
 *
 * 내가 팔로우한 유저 목록 반환
 * Response: { following: string[] }
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ following: [] })
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from("user_follows")
      .select("followed_user_id")
      .eq("follower_id", user.id)

    if (error) {
      return NextResponse.json({ error: "팔로우 목록 조회 실패" }, { status: 500 })
    }

    return NextResponse.json({
      following: (data || []).map((d) => d.followed_user_id),
    })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

/**
 * POST /api/follow
 *
 * 팔로우/언팔로우 토글
 * Body: { user_id: string }
 * Response: { action: 'followed' | 'unfollowed' }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("Invalid request body")
    }
    const FollowSchema = z.object({ user_id: z.string().min(1) })
    const parsed = FollowSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("user_id가 필요합니다.")
    const targetUserId = parsed.data.user_id

    if (targetUserId === user.id) {
      return apiBadRequest("자기 자신을 팔로우할 수 없습니다.")
    }

    const supabase = createServiceRoleClient()

    // 이미 팔로우 중인지 확인
    const { data: existing } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("followed_user_id", targetUserId)
      .single()

    if (existing) {
      // 언팔로우
      const { error: deleteError } = await supabase
        .from("user_follows")
        .delete()
        .eq("id", existing.id)

      if (deleteError) {
        return NextResponse.json({ error: "언팔로우 처리에 실패했습니다." }, { status: 500 })
      }

      return NextResponse.json({ action: "unfollowed" })
    } else {
      // 팔로우
      const { error } = await supabase.from("user_follows").insert({
        follower_id: user.id,
        followed_user_id: targetUserId,
      })

      if (error) {
        return NextResponse.json({ error: "팔로우 실패" }, { status: 500 })
      }

      return NextResponse.json({ action: "followed" })
    }
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}
