import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"
import { getLeagueById } from "@/lib/standings/naver-leagues"

export const dynamic = "force-dynamic"

/**
 * GET /api/standings?league=xxx
 *
 * 캐시된 리그 순위표 반환. 없으면 200 + { data: null, fetchedAt: null }.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueId = searchParams.get("league")
    if (!leagueId) {
      return NextResponse.json({ error: "league 쿼리 파라미터가 필요합니다." }, { status: 400 })
    }

    const league = getLeagueById(leagueId)
    if (!league) {
      return NextResponse.json({ error: "지원하지 않는 리그입니다." }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data: row, error } = await supabase
      .from("standings_cache")
      .select("data, fetched_at")
      .eq("league_id", leagueId)
      .maybeSingle()

    if (error) {
      return apiError("순위표 조회 실패", 500, error)
    }

    const data = row?.data ?? null
    const fetchedAt = row?.fetched_at ?? null

    return NextResponse.json({
      leagueId,
      leagueName: league.name,
      data: Array.isArray(data) ? data : [],
      fetchedAt,
    })
  } catch (error) {
    return apiError("순위표 조회 실패", 500, error)
  }
}
