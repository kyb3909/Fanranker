import { createAnonClient } from "@/lib/supabase/server"
import { StadiumRoom } from "@/components/stadium/stadium-room"
import { notFound } from "next/navigation"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"

export const revalidate = 30

export default async function StadiumDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const supabase = createAnonClient()

  // 팀 + 경기장 조회
  const { data: team } = await supabase
    .from("team_map_pins")
    .select(
      `
      team_id, team_name, team_short_name, sport, league_id, city, country, color,
      team_stadiums ( level, total_points, fan_count )
    `
    )
    .eq("team_id", teamId)
    .eq("is_active", true)
    .single()

  if (!team) notFound()

  const stadium = Array.isArray(team.team_stadiums) ? team.team_stadiums[0] : team.team_stadiums
  const stadiumData = stadium ?? { level: 1, total_points: 0, fan_count: 0 }

  // 레벨 정보 계산
  const currentLevel = STADIUM_LEVELS.find((l) => l.level === stadiumData.level)
  const nextLevel = STADIUM_LEVELS.find((l) => l.level === stadiumData.level + 1)

  let progressPct = 100
  if (nextLevel && currentLevel) {
    const range = nextLevel.requiredPoints - currentLevel.requiredPoints
    const progress = stadiumData.total_points - currentLevel.requiredPoints
    progressPct = range > 0 ? Math.min(100, Math.round((progress / range) * 1000) / 10) : 100
  }

  // 기여자 Top 10
  const { data: contributors } = await supabase
    .from("stadium_contributions")
    .select("user_id, points_contributed")
    .eq("team_id", teamId)
    .gt("points_contributed", 0)
    .order("points_contributed", { ascending: false })
    .limit(10)

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

  const initialData = {
    team: teamInfo,
    stadium: stadiumData,
    level_info: {
      name: currentLevel?.nameKo ?? "빈 땅",
      description: currentLevel?.description ?? "",
      current_required: currentLevel?.requiredPoints ?? 0,
      next_level_points: nextLevel?.requiredPoints ?? null,
      progress_pct: progressPct,
    },
    recent_contributors: recentContributors,
  }

  return <StadiumRoom teamId={teamId} initialData={initialData} />
}
