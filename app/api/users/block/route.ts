import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/users/block
 * 내가 차단한 유저 목록
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_id, created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false })

    if (error) return apiError("차단 목록 조회 실패", 500, error)

    // 차단된 유저 프로필 조회
    const blockedIds = (data || []).map((b) => b.blocked_id)
    let profiles: { user_id: string; nickname: string; avatar_url: string | null }[] = []
    if (blockedIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .in("user_id", blockedIds)
      profiles = profileData || []
    }

    return NextResponse.json({ blocks: data || [], profiles })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

/**
 * POST /api/users/block
 * 유저 차단 / 차단 해제 (토글)
 * Body: { user_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const body = await request.json()
    const targetId = body.user_id as string
    if (!targetId) {
      return NextResponse.json({ error: "user_id가 필요합니다." }, { status: 400 })
    }
    if (targetId === user.id) {
      return NextResponse.json({ error: "자기 자신을 차단할 수 없습니다." }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // 이미 차단 중인지 확인
    const { data: existing } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetId)
      .single()

    if (existing) {
      // 차단 해제
      await supabase.from("user_blocks").delete().eq("id", existing.id)
      return NextResponse.json({ blocked: false })
    } else {
      // 차단
      const { error } = await supabase
        .from("user_blocks")
        .insert({ blocker_id: user.id, blocked_id: targetId })
      if (error) return apiError("차단 실패", 500, error)

      // 팔로우 관계도 해제
      await supabase
        .from("user_follows")
        .delete()
        .or(
          `and(follower_id.eq.${user.id},followed_user_id.eq.${targetId}),and(follower_id.eq.${targetId},followed_user_id.eq.${user.id})`
        )

      return NextResponse.json({ blocked: true })
    }
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
