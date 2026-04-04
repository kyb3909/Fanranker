import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"

/**
 * GET /api/stadiums/[teamId]
 *
 * 경기장 상세: 레벨, 진행도, 팬 수, 최근 기여자
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const { teamId } = await params

    if (!teamId) {
      return apiBadRequest("teamId가 필요합니다.")
    }

    const supabase = createServiceRoleClient()

    // 1. 팀 + 경기장 조회
    const { data: team, error: teamErr } = await supabase
      .from("team_map_pins")
      .select(
        `
        team_id,
        team_name,
        team_short_name,
        sport,
        league_id,
        city,
        country,
        color,
        team_stadiums (
          level,
          total_points,
          fan_count
        )
      `
      )
      .eq("team_id", teamId)
      .eq("is_active", true)
      .single()

    if (teamErr || !team) {
      return apiBadRequest("존재하지 않는 팀입니다.")
    }

    const stadium = Array.isArray(team.team_stadiums) ? team.team_stadiums[0] : team.team_stadiums

    const stadiumData = stadium ?? { level: 1, total_points: 0, fan_count: 0 }

    // 2. 현재 레벨 + 다음 레벨 정보
    const { data: levels } = await supabase
      .from("stadium_level_thresholds")
      .select("level, required_points, name_ko, description")
      .order("level")

    const currentLevel = (levels ?? []).find((l) => l.level === stadiumData.level)
    const nextLevel = (levels ?? []).find((l) => l.level === stadiumData.level + 1)

    let progressPct = 100
    if (nextLevel && currentLevel) {
      const range = nextLevel.required_points - currentLevel.required_points
      const progress = stadiumData.total_points - currentLevel.required_points
      progressPct = range > 0 ? Math.min(100, Math.round((progress / range) * 1000) / 10) : 100
    }

    // 3. 최근 기여자 (상위 10명)
    const { data: contributors } = await supabase
      .from("stadium_contributions")
      .select("user_id, points_contributed, last_synced_at")
      .eq("team_id", teamId)
      .gt("points_contributed", 0)
      .order("points_contributed", { ascending: false })
      .limit(10)

    // 기여자 프로필 조회
    let contributorProfiles: { user_id: string; nickname: string; avatar_url: string | null }[] = []
    if (contributors && contributors.length > 0) {
      const userIds = contributors.map((c) => c.user_id)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .in("user_id", userIds)

      contributorProfiles = profiles ?? []
    }

    const profileMap = new Map(contributorProfiles.map((p) => [p.user_id, p]))

    const recentContributors = (contributors ?? []).map((c) => {
      const profile = profileMap.get(c.user_id)
      return {
        user_id: c.user_id,
        nickname: profile?.nickname ?? "익명",
        avatar_url: profile?.avatar_url ?? null,
        points: c.points_contributed,
      }
    })

    const { team_stadiums: _, ...teamInfo } = team

    return NextResponse.json({
      team: teamInfo,
      stadium: stadiumData,
      level_info: {
        name: currentLevel?.name_ko ?? "빈 땅",
        description: currentLevel?.description ?? "",
        current_required: currentLevel?.required_points ?? 0,
        next_level_points: nextLevel?.required_points ?? null,
        progress_pct: progressPct,
      },
      recent_contributors: recentContributors,
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
