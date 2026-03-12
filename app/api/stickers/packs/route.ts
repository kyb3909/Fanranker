import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/stickers/packs
 * 스티커 팩 목록
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()
    const { data: packs, error } = await supabase
      .from("sticker_packs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")

    if (error) return apiError("팩 조회 실패", 500, error)
    return NextResponse.json({ packs: packs || [] })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
