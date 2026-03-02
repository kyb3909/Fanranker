import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/community/popular
 *
 * 팔로워 수 기준 인기 게시판 상위 3개 반환 (공개 API)
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase.rpc("get_popular_communities", { lim: 3 })

    if (error) {
      // RPC 함수가 없는 경우 fallback: 직접 쿼리
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("community_follows")
        .select("community_slug")
        .limit(5000)

      if (fallbackError) {
        return apiError("인기 게시판 조회 실패", 500, fallbackError)
      }

      // 수동으로 집계
      const counts = new Map<string, number>()
      for (const row of fallbackData || []) {
        counts.set(row.community_slug, (counts.get(row.community_slug) || 0) + 1)
      }
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([community_slug, followers]) => ({ community_slug, followers }))

      return NextResponse.json({ communities: sorted })
    }

    const res = NextResponse.json({ communities: data || [] })
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
