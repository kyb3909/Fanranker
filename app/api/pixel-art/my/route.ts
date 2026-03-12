import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/pixel-art/my
 *
 * 내가 보유한 픽셀아트 목록
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from("user_pixel_arts")
      .select("pixel_art_id, purchased_at, pixel_art_items ( id, slug, name, image_url, category )")
      .eq("user_id", user.id)
      .order("purchased_at", { ascending: false })

    if (error) {
      return apiError("픽셀아트 조회 중 오류가 발생했습니다.", 500, error)
    }

    // 현재 장착 중인 픽셀아트 확인
    const { data: profile } = await supabase
      .from("profiles")
      .select("equipped_pixel_art_id")
      .eq("user_id", user.id)
      .single()

    return NextResponse.json({
      pixel_arts: data || [],
      equipped_id: profile?.equipped_pixel_art_id || null,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
