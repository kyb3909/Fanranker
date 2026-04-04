import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"
import { getMapConfig } from "@/lib/constants/map-config"
import { getLeagueById } from "@/lib/standings/naver-leagues"

/**
 * GET /api/stadiums/map?league=kbo
 *
 * 리그별 팀 목록 + 핀 좌표 + 경기장 레벨
 */
export async function GET(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const leagueId = request.nextUrl.searchParams.get("league")
    if (!leagueId) {
      return apiBadRequest("league 파라미터가 필요합니다.")
    }

    const mapConfig = getMapConfig(leagueId)
    if (!mapConfig) {
      return apiBadRequest("지원하지 않는 리그입니다.")
    }

    const leagueInfo = getLeagueById(leagueId)

    const supabase = createServiceRoleClient()

    const { data: teams, error } = await supabase
      .from("team_map_pins")
      .select(
        `
        team_id,
        team_name,
        team_short_name,
        sport,
        city,
        pin_x,
        pin_y,
        color,
        stadium_name,
        team_stadiums (
          level,
          total_points,
          fan_count
        )
      `
      )
      .eq("league_id", leagueId)
      .eq("is_active", true)
      .order("team_name")

    if (error) {
      return apiError("팀 목록 조회 실패", 500, error)
    }

    const teamsWithStadium = (teams ?? []).map(({ team_stadiums, ...team }) => ({
      ...team,
      stadium: Array.isArray(team_stadiums)
        ? (team_stadiums[0] ?? { level: 1, total_points: 0, fan_count: 0 })
        : (team_stadiums ?? { level: 1, total_points: 0, fan_count: 0 }),
    }))

    return NextResponse.json({
      league: {
        id: leagueId,
        name: leagueInfo?.name ?? leagueId,
        country: mapConfig.country,
        countryName: mapConfig.countryName,
      },
      map_image: mapConfig.mapImage,
      teams: teamsWithStadium,
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
