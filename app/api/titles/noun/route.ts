import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/titles/noun?board_slug=football
 *
 * 명사 칭호 목록 조회 (상점용)
 */
export async function GET(request: NextRequest) {
  try {
    const boardSlug = request.nextUrl.searchParams.get("board_slug")
    const supabase = createAnonClient()

    let query = supabase
      .from("noun_titles")
      .select("id, board_slug, required_level, title, price")
      .order("board_slug")
      .order("required_level")

    if (boardSlug) {
      query = query.eq("board_slug", boardSlug)
    }

    const { data, error } = await query

    if (error) {
      return apiError("칭호 목록 조회 중 오류가 발생했습니다.", 500, error)
    }

    const res = NextResponse.json({ noun_titles: data || [] })
    res.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
