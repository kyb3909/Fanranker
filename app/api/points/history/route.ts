import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/points/history?board_slug=football&limit=20&offset=0
 *
 * 포인트 트랜잭션 내역 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const searchParams = request.nextUrl.searchParams
    const boardSlug = searchParams.get("board_slug")
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50)
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10))

    const supabase = createServiceRoleClient()

    let query = supabase
      .from("point_transactions")
      .select("id, board_slug, amount, transaction_type, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (boardSlug) {
      query = query.eq("board_slug", boardSlug)
    }

    const { data, error } = await query

    if (error) {
      return apiError("내역 조회 중 오류가 발생했습니다.", 500, error)
    }

    return NextResponse.json({ transactions: data || [], hasMore: (data || []).length === limit })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
