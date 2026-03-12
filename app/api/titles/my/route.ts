import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/titles/my
 *
 * 내 칭호 정보 조회:
 * - 보유한 명사 칭호 (구매한)
 * - 획득한 형용사 칭호
 * - 게시판별 장착 칭호
 * - 게시판별 포인트/레벨
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()
    const userId = user.id

    // 병렬 조회
    const [pointsRes, ownedNounsRes, earnedAdjsRes, equippedRes] = await Promise.all([
      supabase
        .from("user_board_points")
        .select("board_slug, total_points, available_points, level")
        .eq("user_id", userId),
      supabase
        .from("user_noun_titles")
        .select(
          "noun_title_id, purchased_at, noun_titles ( id, board_slug, required_level, title, price )"
        )
        .eq("user_id", userId),
      supabase
        .from("user_adj_titles")
        .select(
          "adj_title_id, board_slug, earned_at, adj_titles ( id, slug, title, description, rarity, board_slug )"
        )
        .eq("user_id", userId),
      supabase
        .from("user_equipped_titles")
        .select(
          `
          board_slug,
          adj_title_id,
          noun_title_id,
          adj_titles ( id, title, rarity ),
          noun_titles ( id, title )
        `
        )
        .eq("user_id", userId),
    ])

    return NextResponse.json({
      points: pointsRes.data || [],
      owned_noun_titles: ownedNounsRes.data || [],
      earned_adj_titles: earnedAdjsRes.data || [],
      equipped: equippedRes.data || [],
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
