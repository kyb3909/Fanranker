import { createAnonClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"
import { BuildProgress } from "@/components/stadium/build-progress"

/**
 * 경기장 건설 현황 — 격리 지면 (2026-08-27 단계 0 → 벽돌 단위 투자로 확장).
 *
 * 활동 점수로 벽돌을 "개" 단위로 사서 경기장을 함께 짓는다. 완공까지 오래 걸리는 것이
 * 설계의 일부 — 팬들이 몇 달에 걸쳐 쌓아가는 서사 (2026-08-27 운영자 확정).
 *
 * ⚠️ 격리 원칙 — GNB·피드·사이드바 어디에도 배선하지 않는다. 직접 URL 전용.
 *    노출 지면은 운영자가 정한다.
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

  // 투자자 랭킹 — 누적 기여점수 순 (벽돌 이전의 기부도 포함해야 공정하다).
  // 표기는 벽돌 환산(points / BRICK_PRICE)으로 통일한다.
  const { data: ranking } = await supabase
    .from("stadium_contributions")
    .select("user_id, points_contributed")
    .eq("team_id", teamId)
    .gt("points_contributed", 0)
    .order("points_contributed", { ascending: false })
    .limit(10)

  // 최근 투자 — 벽돌 구매 이벤트 (구매 1건 = 1행, 순번 포함)
  const { data: recentBricks } = await supabase
    .from("stadium_bricks")
    .select("user_id, brick_count, start_index, created_at")
    .eq("team_id", teamId)
    .order("id", { ascending: false })
    .limit(10)

  const userIds = [
    ...new Set([
      ...(ranking ?? []).map((r) => r.user_id),
      ...(recentBricks ?? []).map((r) => r.user_id),
    ]),
  ]
  let profiles: { user_id: string; nickname: string }[] = []
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", userIds)
    profiles = data ?? []
  }
  const nickOf = new Map(profiles.map((p) => [p.user_id, p.nickname]))

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
      investors={(ranking ?? []).map((r, i) => ({
        rank: i + 1,
        nickname: nickOf.get(r.user_id) ?? "익명",
        bricks: Math.floor(r.points_contributed / BRICK_PRICE),
        points: r.points_contributed,
      }))}
      recentBuys={(recentBricks ?? []).map((r) => ({
        nickname: nickOf.get(r.user_id) ?? "익명",
        bricks: r.brick_count,
        startIndex: r.start_index,
        at: r.created_at,
      }))}
    />
  )
}
