import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { matchFavoriteTeamToId } from "@/lib/stadium/team-matcher"

/**
 * GET /api/stadiums/my-contribution
 *
 * 현재 유저의 경기장 기여 현황
 * - 응원팀, 기여 점수, 경기장 레벨 등
 */
export async function GET(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const userId = user.id
    const supabase = createServiceRoleClient()

    // 1. 프로필에서 favorite_team 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("favorite_team")
      .eq("user_id", userId)
      .single()

    const favoriteTeam = profile?.favorite_team
    const teamId = matchFavoriteTeamToId(favoriteTeam)

    if (!teamId) {
      return NextResponse.json({
        has_team: false,
        favorite_team: favoriteTeam,
        message: favoriteTeam
          ? "응원팀을 인식할 수 없습니다. 프로필에서 팀 이름을 확인해주세요."
          : "프로필에서 응원팀을 설정해주세요.",
      })
    }

    // 2. 팀 + 경기장 정보
    const { data: team } = await supabase
      .from("team_map_pins")
      .select(
        `
        team_id,
        team_name,
        team_short_name,
        sport,
        league_id,
        color,
        team_stadiums (
          level,
          total_points,
          fan_count
        )
      `
      )
      .eq("team_id", teamId)
      .single()

    if (!team) {
      return NextResponse.json({
        has_team: false,
        favorite_team: favoriteTeam,
        matched_team_id: teamId,
        message: "매칭된 팀 데이터를 찾을 수 없습니다.",
      })
    }

    // 3. 내 기여 조회
    const { data: contribution } = await supabase
      .from("stadium_contributions")
      .select("points_contributed, last_synced_at")
      .eq("user_id", userId)
      .eq("team_id", teamId)
      .single()

    // 4. 내 활동 통계
    const { data: stats } = await supabase
      .from("betman_user_sport_stats")
      .select("total_predictions, correct_predictions")
      .eq("user_id", userId)
      .eq("sport", "전체")
      .single()

    const totalPredictions = Number(stats?.total_predictions) || 0
    const correctPredictions = Number(stats?.correct_predictions) || 0
    const activityPoints = totalPredictions * 10 + correctPredictions * 25

    const stadium = Array.isArray(team.team_stadiums) ? team.team_stadiums[0] : team.team_stadiums

    const { team_stadiums: _, ...teamInfo } = team

    return NextResponse.json({
      has_team: true,
      team: teamInfo,
      stadium: stadium ?? { level: 1, total_points: 0, fan_count: 0 },
      my_contribution: {
        points_contributed: contribution?.points_contributed ?? 0,
        last_synced_at: contribution?.last_synced_at ?? null,
        current_activity_points: activityPoints,
        total_predictions: totalPredictions,
        correct_predictions: correctPredictions,
      },
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
