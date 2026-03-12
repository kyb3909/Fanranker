import { NextRequest, NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/profile/[userId]
 *
 * 공개 프로필 조회 - 비로그인도 접근 가능
 * 닉네임, 아바타, 온도, 기자/전문가 여부, 최근 작성글, 포인트/칭호/픽셀아트 반환
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

    // 게시판별 포인트/레벨 (새 테이블 — 에러 시 빈 배열)
    let boardPoints: {
      board_slug: string
      total_points: number
      available_points: number
      level: number
    }[] = []
    try {
      const res = await supabase
        .from("user_board_points")
        .select("board_slug, total_points, available_points, level")
        .eq("user_id", userId)
        .order("total_points", { ascending: false })
      boardPoints = res.data || []
    } catch {
      /* table may not exist yet */
    }

    // 장착 칭호
    let equippedTitleRows: { board_slug: string; adj_titles: unknown; noun_titles: unknown }[] = []
    try {
      const res = await supabase
        .from("user_equipped_titles")
        .select("board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
        .eq("user_id", userId)
      equippedTitleRows = (res.data || []) as typeof equippedTitleRows
    } catch {
      /* table may not exist yet */
    }

    // 보유 픽셀아트
    let pixelArts: {
      pixel_art_id: string
      purchased_at: string
      pixel_art_items: {
        id: string
        slug: string
        name: string
        image_url: string
        category: string
      }
    }[] = []
    try {
      const res = await supabase
        .from("user_pixel_arts")
        .select(
          "pixel_art_id, purchased_at, pixel_art_items ( id, slug, name, image_url, category )"
        )
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false })
      pixelArts = (res.data || []) as unknown as typeof pixelArts
    } catch {
      /* table may not exist yet */
    }

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
      board_points: boardPoints,
      equipped_titles: equippedTitleRows.map((t) => {
        const adj = t.adj_titles as unknown as { title: string; rarity: string } | null
        const noun = t.noun_titles as unknown as { title: string } | null
        return {
          board_slug: t.board_slug,
          adj_title: adj?.title || null,
          noun_title: noun?.title || null,
          rarity: adj?.rarity || null,
        }
      }),
      pixel_arts: pixelArts,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
