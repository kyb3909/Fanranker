import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { createAnonClient } from "@/lib/supabase/server"
import { auth } from "@clerk/nextjs/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/betman/rankings
 *
 * 종목별 랭킹 조회 (betman_user_sport_stats 기반)
 *
 * Query:
 *   sport: '전체' | '축구' | '농구' | '배구' | '야구' (기본: '전체')
 *   sort: 'profit_rate' | 'accuracy' | 'net_profit' (기본: 'profit_rate')
 *   limit: number (기본: 50)
 *   offset: number (기본: 0)
 *   min_predictions: number (기본: 1, 최소 예측 수 필터)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const { searchParams } = new URL(request.url)

    const sport = searchParams.get("sport") || "전체"
    const sort = searchParams.get("sort") || "profit_rate"
    const limit = parseLimit(searchParams, { def: 50, max: 100 })
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const minPredictions = parseInt(searchParams.get("min_predictions") || "1", 10)

    // 정렬 컬럼 매핑
    const sortColumn =
      sort === "accuracy" ? "accuracy" : sort === "net_profit" ? "net_profit" : "profit_rate"

    // 현재 유저 ID를 한 번만 조회
    let currentUserId: string | null = null
    try {
      const { userId } = await auth()
      currentUserId = userId
    } catch {
      /* not logged in */
    }

    // 랭킹 조회
    const {
      data: stats,
      error: statsError,
      count,
    } = await supabase
      .from("betman_user_sport_stats")
      .select(
        "user_id, sport, total_predictions, correct_predictions, wrong_predictions, accuracy, total_wagered, total_returns, net_profit, profit_rate, current_streak, best_win_streak",
        { count: "exact" }
      )
      .eq("sport", sport)
      .gte("total_predictions", minPredictions)
      .gt("total_wagered", 0)
      .order(sortColumn, { ascending: false })
      .order("total_predictions", { ascending: false })
      .order("user_id", { ascending: true })
      .range(offset, offset + limit - 1)

    if (statsError) {
      return NextResponse.json({ error: "랭킹 조회 실패" }, { status: 500 })
    }

    if (!stats || stats.length === 0) {
      // 내 순위도 조회
      let myRank = null
      if (currentUserId) {
        const { data: myStats } = await supabase
          .from("betman_user_sport_stats")
          .select(
            "user_id, sport, total_predictions, correct_predictions, wrong_predictions, accuracy, total_wagered, total_returns, net_profit, profit_rate, current_streak, best_win_streak"
          )
          .eq("user_id", currentUserId)
          .eq("sport", sport)
          .single()

        if (myStats) {
          myRank = { ...myStats, rank: null, nickname: null, avatar_url: null }
        }
      }

      return NextResponse.json(
        {
          rankings: [],
          total: 0,
          my_rank: myRank,
        },
        {
          headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
        }
      )
    }

    // 프로필 정보 조회
    const userIds = stats.map((s) => s.user_id)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in("user_id", userIds)

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]))

    // 랭킹 데이터 생성
    const rankings = stats.map((stat, idx) => {
      const profile = profileMap.get(stat.user_id)
      return {
        rank: offset + idx + 1,
        user_id: stat.user_id,
        nickname: profile?.nickname || "익명",
        avatar_url: profile?.avatar_url || null,
        sport: stat.sport,
        total_predictions: stat.total_predictions,
        correct_predictions: stat.correct_predictions,
        wrong_predictions: stat.wrong_predictions,
        accuracy: parseFloat(stat.accuracy) || 0,
        total_wagered: stat.total_wagered,
        total_returns: parseFloat(stat.total_returns) || 0,
        net_profit: parseFloat(stat.net_profit) || 0,
        profit_rate: parseFloat(stat.profit_rate) || 0,
        current_streak: stat.current_streak,
        best_win_streak: stat.best_win_streak,
      }
    })

    // 내 순위 조회 (이미 위에서 auth()로 조회한 currentUserId 재사용)
    let myRank = null
    if (currentUserId) {
      // 랭킹 목록에 이미 포함된 경우 재사용, 아니면 DB 조회
      const existingInRankings = stats.find((s) => s.user_id === currentUserId)
      const myStats =
        existingInRankings ||
        (
          await supabase
            .from("betman_user_sport_stats")
            .select(
              "user_id, sport, total_predictions, correct_predictions, wrong_predictions, accuracy, total_wagered, total_returns, net_profit, profit_rate, current_streak, best_win_streak"
            )
            .eq("user_id", currentUserId)
            .eq("sport", sport)
            .single()
        ).data

      if (myStats && (myStats.total_wagered ?? 0) > 0) {
        // 내 순위 계산: 나보다 높은 사람 수 + 1
        const { count: higherCount } = await supabase
          .from("betman_user_sport_stats")
          .select("id", { count: "exact", head: true })
          .eq("sport", sport)
          .gte("total_predictions", minPredictions)
          .gt("total_wagered", 0)
          .gt(sortColumn, parseFloat(String(myStats[sortColumn as keyof typeof myStats] ?? 0)))

        // profileMap에 있으면 재사용, 없으면 DB 조회
        const myProfile =
          profileMap.get(currentUserId) ||
          (
            await supabase
              .from("profiles")
              .select("nickname, avatar_url")
              .eq("user_id", currentUserId)
              .single()
          ).data

        myRank = {
          rank: (higherCount ?? 0) + 1,
          user_id: currentUserId,
          nickname: myProfile?.nickname || "익명",
          avatar_url: myProfile?.avatar_url || null,
          sport: myStats.sport,
          total_predictions: myStats.total_predictions,
          correct_predictions: myStats.correct_predictions,
          accuracy: parseFloat(myStats.accuracy) || 0,
          total_wagered: myStats.total_wagered,
          net_profit: parseFloat(myStats.net_profit) || 0,
          profit_rate: parseFloat(myStats.profit_rate) || 0,
          current_streak: myStats.current_streak,
          best_win_streak: myStats.best_win_streak,
        }
      }
    }

    const res = NextResponse.json({
      rankings,
      total: count ?? 0,
      my_rank: myRank,
    })
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120")
    return res
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
