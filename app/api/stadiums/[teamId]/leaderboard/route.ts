import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/stadiums/[teamId]/leaderboard?limit=20
 *
 * 팀별 top 기여자 랭킹.
 * stadium_contributions 기반 (베팅 적중 수익 + flair 활동 점수 기부 모두 누적).
 * profile 정보 (nickname, avatar) join.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 20)))
    const supabase = createServiceRoleClient()

    const { data: contributions, error } = await supabase
      .from("stadium_contributions")
      .select("user_id, points_contributed, last_synced_at")
      .eq("team_id", teamId)
      .gt("points_contributed", 0)
      .order("points_contributed", { ascending: false })
      .limit(limit)

    if (error) {
      return apiError("랭킹 조회 중 오류가 발생했습니다.", 500, error)
    }

    const userIds = (contributions ?? []).map((c) => c.user_id)
    const { data: profiles } =
      userIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, nickname, avatar_url, display_title_id")
            .in("user_id", userIds)
        : { data: [] }
    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]))

    // display_title 의 name 도 join
    const titleIds = [
      ...new Set((profiles ?? []).map((p) => p.display_title_id).filter(Boolean) as string[]),
    ]
    const { data: titles } =
      titleIds.length > 0
        ? await supabase.from("flair_titles").select("id, name, flair_id").in("id", titleIds)
        : { data: [] }
    const titleMap = new Map((titles ?? []).map((t) => [t.id, t]))

    const ranked = (contributions ?? []).map((c, i) => {
      const p = profileMap.get(c.user_id)
      const t = p?.display_title_id ? titleMap.get(p.display_title_id) : null
      return {
        rank: i + 1,
        user_id: c.user_id,
        nickname: p?.nickname ?? null,
        avatar_url: p?.avatar_url ?? null,
        display_title: t?.name ?? null,
        points_contributed: Number(c.points_contributed),
        last_at: c.last_synced_at,
      }
    })

    const res = NextResponse.json({ team_id: teamId, leaderboard: ranked })
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    return res
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
