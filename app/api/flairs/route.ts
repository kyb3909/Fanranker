import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"

/**
 * GET /api/flairs?community_slug=football
 * 게시판별 말머리 목록 조회
 */
export async function GET(request: NextRequest) {
  const communitySlug = request.nextUrl.searchParams.get("community_slug")
  // 담벼락 말머리 필터 바 — 팔로우한 여러 게시판의 말머리를 한 번에 조회
  const communitySlugsParam = request.nextUrl.searchParams.get("community_slugs")
  const communitySlugs = communitySlugsParam ? communitySlugsParam.split(",").filter(Boolean) : null
  if (!communitySlug && !communitySlugs) {
    return NextResponse.json({ flairs: [] })
  }

  const supabase = createAnonClient()
  let query = supabase
    .from("post_flairs")
    .select("id, name, color, sort_order, community_slug")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  if (communitySlug) {
    query = query.eq("community_slug", communitySlug)
  } else if (communitySlugs) {
    query = query.in("community_slug", communitySlugs)
  }
  const { data: flairs, error } = await query

  if (error) {
    return NextResponse.json({ flairs: [] })
  }

  const res = NextResponse.json({ flairs: flairs || [] })
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
  return res
}
