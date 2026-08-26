import { createAnonClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"
import { BuildProgress } from "@/components/stadium/build-progress"

/**
 * 경기장 건설 현황 — 격리 지면 (2026-08-27 단계 0).
 *
 * 워크스페이스 stadium-build-FINAL-20260827.md 의 단계 0: 기존 기부 인프라
 * (team_stadiums.total_points + donate_flair_score_to_team RPC) 위에
 * 진행률 게이지 + 원탭 기부 + 최근 기여자만 얹는다. 신규 테이블·엔진 없음.
 *
 * ⚠️ 메타버스 전례를 따르는 격리 원칙 — GNB·피드·사이드바 어디에도 배선하지 않는다.
 *    직접 URL(/stadium/{teamId}/build)로만 접근. 노출 지면은 운영자가 정한다.
 */
export const revalidate = 30

export default async function StadiumBuildPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const supabase = createAnonClient()

  const { data: team } = await supabase
    .from("team_map_pins")
    .select(
      `team_id, team_name, team_short_name, color,
       team_stadiums ( level, total_points, fan_count )`
    )
    .eq("team_id", teamId)
    .eq("is_active", true)
    .single()

  if (!team) notFound()

  const stadium = Array.isArray(team.team_stadiums) ? team.team_stadiums[0] : team.team_stadiums
  const stadiumData = stadium ?? { level: 1, total_points: 0, fan_count: 0 }

  const currentLevel =
    STADIUM_LEVELS.find((l) => l.level === stadiumData.level) ?? STADIUM_LEVELS[0]
  const nextLevel = STADIUM_LEVELS.find((l) => l.level === stadiumData.level + 1) ?? null

  // 최근 기여자 — 부모 페이지의 누적 Top 10 과 달리 여기는 "방금 누가 얹었나"가 본체다.
  // last_synced_at 이 기부마다 갱신되므로 그대로 최근 순 정렬에 쓴다.
  const { data: recent } = await supabase
    .from("stadium_contributions")
    .select("user_id, points_contributed, last_synced_at")
    .eq("team_id", teamId)
    .gt("points_contributed", 0)
    .order("last_synced_at", { ascending: false })
    .limit(10)

  let profiles: { user_id: string; nickname: string; avatar_url: string | null }[] = []
  if (recent && recent.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in(
        "user_id",
        recent.map((c) => c.user_id)
      )
    profiles = data ?? []
  }
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))

  return (
    <BuildProgress
      teamId={teamId}
      teamName={String(team.team_name)}
      teamColor={String(team.color ?? "")}
      initial={{
        level: stadiumData.level,
        totalPoints: stadiumData.total_points,
        fanCount: stadiumData.fan_count,
        levelName: currentLevel.nameKo,
        levelEmoji: currentLevel.emoji,
        currentRequired: currentLevel.requiredPoints,
        nextRequired: nextLevel?.requiredPoints ?? null,
        nextLevelName: nextLevel?.nameKo ?? null,
      }}
      recentContributors={(recent ?? []).map((c) => ({
        userId: c.user_id,
        nickname: profileMap.get(c.user_id)?.nickname ?? "익명",
        avatarUrl: profileMap.get(c.user_id)?.avatar_url ?? null,
        points: c.points_contributed,
        lastAt: c.last_synced_at,
      }))}
    />
  )
}
