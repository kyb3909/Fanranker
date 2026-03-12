import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/pixel-art?category=football
 *
 * 픽셀아트 아이템 목록 (상점용)
 */
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category")
    const supabase = createAnonClient()

    let query = supabase
      .from("pixel_art_items")
      .select("id, slug, name, image_url, category, price, board_slug, is_limited, is_active")
      .eq("is_active", true)
      .order("category")
      .order("price")

    if (category) {
      query = query.eq("category", category)
    }

    const { data, error } = await query

    if (error) {
      return apiError("픽셀아트 목록 조회 중 오류가 발생했습니다.", 500, error)
    }

    const res = NextResponse.json({ items: data || [] })
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
