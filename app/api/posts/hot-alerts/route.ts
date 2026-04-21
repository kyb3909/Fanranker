import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/posts/hot-alerts
 *
 * 실시간 인기글 알림용 엔드포인트. 30초 주기로 클라이언트가 폴링.
 * 펨코의 실시간 베스트 토스트와 같은 역할.
 *
 * 조건: temperature >= 50 AND 최근 1시간 내 작성 AND (팔로우한 커뮤니티 필터)
 *
 * Query:
 *  - since: ISO timestamp — 마지막 조회 시점 (서버는 최근 1시간으로 clamp)
 *  - follows: "slug1,slug2,..." — 팔로우 slug 리스트 (빈 값이면 전체)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sinceParam = searchParams.get("since")
    const followsParam = searchParams.get("follows") || ""

    // 최근 1시간으로 clamp (너무 과거는 서버 부담)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const since =
      sinceParam && new Date(sinceParam) > oneHourAgo ? new Date(sinceParam) : oneHourAgo

    const supabase = createAnonClient()

    let query = supabase
      .from("posts")
      .select("id, community_slug, title, temperature, created_at")
      .is("deleted_at", null)
      .gte("temperature", 50)
      .gte("created_at", since.toISOString())
      .order("temperature", { ascending: false })
      .limit(5)

    const slugs = followsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (slugs.length > 0) {
      query = query.in("community_slug", slugs)
    }

    const { data: posts, error } = await query
    if (error) {
      return NextResponse.json({ posts: [] }, { headers: { "Cache-Control": "no-store" } })
    }

    // 커뮤니티 name join (categories 테이블)
    const uniqueSlugs = [
      ...new Set((posts || []).map((p) => p.community_slug).filter(Boolean) as string[]),
    ]
    let nameMap = new Map<string, string>()
    if (uniqueSlugs.length > 0) {
      const { data: cats } = await supabase
        .from("categories")
        .select("slug, name")
        .in("slug", uniqueSlugs)
      nameMap = new Map((cats || []).map((c) => [c.slug, c.name]))
    }

    const result = (posts || []).map((p) => ({
      id: p.id,
      community_slug: p.community_slug,
      community_name: p.community_slug ? nameMap.get(p.community_slug) || "" : "",
      title: p.title,
      temperature: p.temperature,
      created_at: p.created_at,
    }))

    return NextResponse.json({ posts: result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return apiError("hot-alerts 조회 실패", 500, error)
  }
}
