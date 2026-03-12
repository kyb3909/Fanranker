import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/stickers/my
 * 내가 소유한 스티커 목록 (댓글 스티커 피커에서 사용)
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from("user_stickers")
      .select("sticker_id, purchased_at, stickers(*)")
      .eq("user_id", user.id)
      .order("purchased_at", { ascending: false })

    if (error) return apiError("조회 실패", 500, error)

    const stickers = (data || []).map((row: Record<string, unknown>) => ({
      ...(row.stickers as Record<string, unknown>),
      purchased_at: row.purchased_at,
    }))

    return NextResponse.json({ stickers })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
