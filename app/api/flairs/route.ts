import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"

/**
 * GET /api/flairs?community_slug=football
 * 게시판별 말머리 목록 조회
 */
export async function GET(request: NextRequest) {
  const communitySlug = request.nextUrl.searchParams.get("community_slug")
  if (!communitySlug) {
    return NextResponse.json({ flairs: [] })
  }

  const supabase = createAnonClient()
  const { data: flairs, error } = await supabase
    .from("post_flairs")
    .select("id, name, color, sort_order, team_id")
    .eq("community_slug", communitySlug)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ flairs: [] })
  }

  const res = NextResponse.json({ flairs: flairs || [] })
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
  return res
}
