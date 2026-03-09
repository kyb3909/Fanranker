import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/profile/[userId]
 *
 * 공개 프로필 조회 - 비로그인도 접근 가능
 * 닉네임, 아바타, 온도, 기자/전문가 여부, 최근 작성글 반환
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    const supabase = createServiceRoleClient()

    // 프로필 기본 정보
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, bio, temperature, is_journalist, role, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .single()

    if (profileError) {
      if (profileError.code === "PGRST116") {
        return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 })
      }
      return apiError("프로필 조회 중 오류가 발생했습니다.", 500, profileError)
    }

    // 최근 작성글 (최대 10개, 공개 글만)
    const { data: recentPosts } = await supabase
      .from("posts")
      .select("id, title, vote_count, comment_count, created_at, community_slug")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10)

    return NextResponse.json({
      profile: {
        user_id: profile.user_id,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        temperature: profile.temperature,
        is_journalist: profile.is_journalist,
        is_expert: profile.role === "expert",
        created_at: profile.created_at,
      },
      recent_posts: recentPosts || [],
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
