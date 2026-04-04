import { SupabaseClient } from "@supabase/supabase-js"
import { matchFavoriteTeamToId } from "./team-matcher"

/**
 * 활동 점수 계산 공식
 * total_predictions × 10 + correct_predictions × 25
 */
function calculateActivityPoints(totalPredictions: number, correctPredictions: number): number {
  return totalPredictions * 10 + correctPredictions * 25
}

/**
 * 정산 후 영향받은 유저들의 경기장 기여를 동기화
 *
 * 1. 각 유저의 favorite_team → team_id 매칭
 * 2. betman_user_sport_stats에서 활동 점수 계산
 * 3. sync_stadium_contribution RPC 호출 (delta 기반, 멱등)
 */
export async function syncStadiumContributions(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<{ synced: number; errors: string[] }> {
  const result = { synced: 0, errors: [] as string[] }

  if (userIds.length === 0) return result

  // 1. 유저들의 favorite_team 조회
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("user_id, favorite_team")
    .in("user_id", userIds)
    .not("favorite_team", "is", null)

  if (profileErr || !profiles) {
    if (profileErr) result.errors.push(`profiles query: ${profileErr.message}`)
    return result
  }

  // 2. 유저들의 통계 조회 (sport='전체')
  const profileUserIds = profiles.map((p) => p.user_id)
  if (profileUserIds.length === 0) return result

  const { data: stats, error: statsErr } = await supabase
    .from("betman_user_sport_stats")
    .select("user_id, total_predictions, correct_predictions")
    .in("user_id", profileUserIds)
    .eq("sport", "전체")

  if (statsErr || !stats) {
    if (statsErr) result.errors.push(`stats query: ${statsErr.message}`)
    return result
  }

  const statsMap = new Map(stats.map((s) => [s.user_id, s]))

  // 3. 각 유저별 기여 동기화
  for (const profile of profiles) {
    const teamId = matchFavoriteTeamToId(profile.favorite_team)
    if (!teamId) continue

    const userStats = statsMap.get(profile.user_id)
    if (!userStats) continue

    const points = calculateActivityPoints(
      Number(userStats.total_predictions) || 0,
      Number(userStats.correct_predictions) || 0
    )

    if (points <= 0) continue

    try {
      const { error: rpcErr } = await supabase.rpc("sync_stadium_contribution", {
        p_user_id: profile.user_id,
        p_team_id: teamId,
        p_new_points: points,
      })

      if (rpcErr) {
        result.errors.push(`sync user=${profile.user_id}: ${rpcErr.message}`)
      } else {
        result.synced++
      }
    } catch (err) {
      result.errors.push(`sync user=${profile.user_id}: ${(err as Error).message}`)
    }
  }

  return result
}
