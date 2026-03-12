import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/points
 *
 * 현재 유저의 모든 게시판별 포인트/레벨 조회
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from("user_board_points")
      .select("board_slug, total_points, available_points, level, updated_at")
      .eq("user_id", user.id)
      .order("total_points", { ascending: false })

    if (error) {
      return apiError("포인트 조회 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json({ points: data || [] })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
