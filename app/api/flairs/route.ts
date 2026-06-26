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

  // 숨김 게시판(categories.is_active=false)의 말머리는 필터에서 제외.
  // (게시판을 다시 열면 자동으로 다시 노출됨 — 말머리 데이터를 직접 끄지 않음.)
  const requested = communitySlug ? [communitySlug] : (communitySlugs ?? [])
  const { data: inactiveCats } = await supabase
    .from("categories")
    .select("slug")
    .eq("is_active", false)
  const inactiveSet = new Set((inactiveCats ?? []).map((c) => c.slug))
  const visibleSlugs = requested.filter((s) => !inactiveSet.has(s))
  if (visibleSlugs.length === 0) {
    return NextResponse.json({ flairs: [] })
  }

  const { data: flairs, error } = await supabase
    .from("post_flairs")
    .select("id, name, color, sort_order, community_slug")
    .eq("is_active", true)
    .in("community_slug", visibleSlugs)
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ flairs: [] })
  }

  const res = NextResponse.json({ flairs: flairs || [] })
  res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
  return res
}
