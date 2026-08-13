import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/gallery — 아이돌 갤러리 공개 조회 (비로그인 포함).
 *
 * 테이블은 RLS 로 잠겨 있고 읽기는 이 API(service role)만 지난다.
 * 이미지는 X CDN 참조 — 우리는 목록 메타만 내려준다.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()
    const { searchParams } = request.nextUrl
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "100", 10) || 100)
    )
    const tag = searchParams.get("tag")

    let query = supabase
      .from("gallery_items")
      .select("id, tweet_url, author_name, author_handle, media, tag, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (tag) query = query.eq("tag", tag)

    const { data, error } = await query
    if (error) return apiError("갤러리를 불러오지 못했습니다.", 500, error)

    const res = NextResponse.json({ items: data ?? [] })
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    return res
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
