import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/users/experts
 *
 * Get list of expert users, sorted by total profit (performance)
 *
 * Query Parameters:
 * - sort?: "profit" | "accuracy" | "roi" (default: "profit")
 * - limit?: number (default: 20)
 * - offset?: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const { searchParams } = new URL(request.url)

    const sort = searchParams.get("sort") || "profit" // 'profit' | 'accuracy' | 'roi'
    const limit = parseInt(searchParams.get("limit") || "20", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // profiles와 user_prediction_stats 간 FK가 없으므로 두 쿼리로 분리 후 user_id로 조인.
    const { data: experts, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, is_expert, expert_certified_at")
      .eq("is_expert", true)

    if (profilesError) {
      return apiError("전문가 목록 조회 중 오류가 발생했습니다.", 500, profilesError)
    }

    const expertIds = (experts ?? []).map((e) => e.user_id)
    let statsByUser: Record<
      string,
      {
        total_predictions: number | null
        correct_predictions: number | null
        win_rate: number | null
        total_points: number | null
        points_won: number | null
        points_lost: number | null
        current_streak: number | null
        best_win_streak: number | null
      }
    > = {}
    if (expertIds.length > 0) {
      const { data: stats, error: statsError } = await supabase
        .from("user_prediction_stats")
        .select(
          "user_id, total_predictions, correct_predictions, win_rate, total_points, points_won, points_lost, current_streak, best_win_streak"
        )
        .in("user_id", expertIds)
      if (statsError) {
        return apiError("전문가 통계 조회 중 오류가 발생했습니다.", 500, statsError)
      }
      statsByUser = Object.fromEntries((stats ?? []).map((s) => [s.user_id, s]))
    }

    const transformedExperts = (experts ?? [])
      .map((expert) => {
        const stats = statsByUser[expert.user_id] ?? {}
        const pointsWon = stats.points_won ?? 0
        const pointsLost = stats.points_lost ?? 0
        const profit = pointsWon - pointsLost
        const roi = pointsLost > 0 ? profit / pointsLost : 0
        return {
          user_id: expert.user_id,
          nickname: expert.nickname || "익명",
          avatar_url: expert.avatar_url || null,
          is_expert: expert.is_expert,
          expert_certified_at: expert.expert_certified_at,
          total_predictions: stats.total_predictions ?? 0,
          correct_predictions: stats.correct_predictions ?? 0,
          accuracy: stats.win_rate ?? 0,
          total_points: stats.total_points ?? 0,
          profit,
          roi,
          current_streak: stats.current_streak ?? 0,
          longest_streak: stats.best_win_streak ?? 0,
        }
      })
      .sort((a, b) => {
        switch (sort) {
          case "accuracy":
            return (b.accuracy || 0) - (a.accuracy || 0)
          case "roi":
            return (b.roi || 0) - (a.roi || 0)
          case "profit":
          default:
            return (b.profit || 0) - (a.profit || 0)
        }
      })
      .slice(offset, offset + limit)

    const res = NextResponse.json({
      experts: transformedExperts,
      sort,
      limit,
      offset,
      total: transformedExperts.length,
    })
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
