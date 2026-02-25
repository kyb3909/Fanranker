import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/feed/predictions
 *
 * 팔로우한 유저들의 예측 활동 피드
 * 각 activity에 대해 구매 여부 체크, 구매한 경우 예측 데이터 포함
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)
    const offset = parseInt(searchParams.get("offset") || "0")

    // 1. 팔로우하는 유저 목록
    const { data: follows } = await supabase
      .from("user_follows")
      .select("followed_user_id")
      .eq("follower_id", user.id)

    if (!follows || follows.length === 0) {
      return NextResponse.json({ activities: [] })
    }

    const followedIds = follows.map((f) => f.followed_user_id)

    // 2. 팔로우한 유저들의 prediction_activities 조회
    const { data: activities, error: actError } = await supabase
      .from("prediction_activities")
      .select(
        `
        id, user_id, round_id, sport, prediction_count, created_at
      `
      )
      .in("user_id", followedIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (actError) {
      return apiError("피드를 불러오는 중 오류가 발생했습니다.", 500, actError)
    }

    if (!activities || activities.length === 0) {
      return NextResponse.json({ activities: [] })
    }

    // 3. 구매 여부 체크
    const activityIds = activities.map((a) => a.id)
    const { data: purchases } = await supabase
      .from("prediction_purchases")
      .select("activity_id")
      .eq("buyer_id", user.id)
      .in("activity_id", activityIds)

    const purchasedSet = new Set(purchases?.map((p) => p.activity_id) || [])

    // 4. 프로필 조회
    const userIds = [...new Set(activities.map((a) => a.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in("user_id", userIds)

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

    // 5. 유저 스탯 조회 (전체 종목)
    const { data: stats } = await supabase
      .from("betman_user_sport_stats")
      .select("user_id, accuracy, net_profit, current_streak")
      .in("user_id", userIds)
      .eq("sport", "전체")

    const statsMap = new Map(stats?.map((s) => [s.user_id, s]) || [])

    // 6. 라운드 정보 조회
    const roundIds = [...new Set(activities.map((a) => a.round_id))]
    const { data: rounds } = await supabase
      .from("betman_rounds")
      .select("id, year, round, status")
      .in("id", roundIds)

    const roundMap = new Map(rounds?.map((r) => [r.id, r]) || [])

    // 7. 모든 활동의 예측 데이터 일괄 조회 (경기 종료 여부 판단용 + odds/league_code)
    const allRoundIds = [...new Set(activities.map((a) => a.round_id))]
    const { data: allPreds } = await supabase
      .from("betman_predictions")
      .select(
        `
        id, user_id, round_id, game_id, prediction, status, slip_id, stake,
        game:betman_games(home_team_name, away_team_name, match_time, game_type, sport, result,
          league_code, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds),
        slip:prediction_slips(id, stake, total_odds, status)
      `
      )
      .in("user_id", userIds)
      .in("round_id", allRoundIds)

    // 활동별로 예측 그룹핑
    const predictionsMap = new Map<string, typeof allPreds>()
    for (const act of activities) {
      const preds =
        allPreds?.filter((p) => p.user_id === act.user_id && p.round_id === act.round_id) || []
      predictionsMap.set(act.id, preds)
    }

    // 경기 시간이 모두 지났는지 확인하는 함수
    const now = new Date()
    const isAllGamesExpired = (preds: NonNullable<typeof allPreds>) => {
      return (
        preds.length > 0 && preds.every((p) => p.game && new Date((p.game as any).match_time) < now)
      )
    }

    // Helper: build slipGroups from predictions
    const buildSlipGroups = (preds: NonNullable<typeof allPreds>) => {
      // Group by slip_id (or round_id for legacy)
      const bySlip = new Map<string, typeof preds>()
      for (const pred of preds) {
        const key = (pred as any).slip_id || pred.round_id || "unknown"
        if (!bySlip.has(key)) bySlip.set(key, [])
        bySlip.get(key)!.push(pred)
      }

      return Array.from(bySlip.entries()).map(([slipId, slipPreds]) => {
        const first = slipPreds[0]
        const game0 = first.game as any
        const slip0 = (first as any).slip as any
        const sport = game0?.sport || "스포츠"

        // Determine slip status
        const allSettled = slipPreds.every((p) => p.status === "settled")
        const allCorrect = slipPreds.every((p) => {
          const g = p.game as any
          return g?.result && g.result === p.prediction
        })
        const anyWrong = slipPreds.some((p) => {
          const g = p.game as any
          return g?.result && g.result !== p.prediction
        })
        const slipStatus = !allSettled ? "pending" : allCorrect ? "win" : "lose"

        // Calculate total odds from slip or from individual games
        const totalOdds =
          slip0?.total_odds ||
          slipPreds.reduce((acc: number, p: any) => {
            const g = p.game as any
            let odds = 1
            if (p.prediction === "home") odds = parseFloat(g?.home_win_odds) || 1
            else if (p.prediction === "away") odds = parseFloat(g?.away_win_odds) || 1
            else if (p.prediction === "draw") odds = parseFloat(g?.draw_odds) || 1
            else if (p.prediction === "over") odds = parseFloat(g?.over_odds) || 1
            else if (p.prediction === "under") odds = parseFloat(g?.under_odds) || 1
            return acc * odds
          }, 1)

        const stake = slip0?.stake || (first as any).stake || slipPreds.length
        const profit =
          slipStatus === "win"
            ? Math.round(stake * totalOdds - stake)
            : slipStatus === "lose"
              ? -stake
              : 0

        // Match time for date display
        const matchDate = game0?.match_time
          ? new Date(game0.match_time).toLocaleDateString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
            })
          : ""

        const resultLabelMap: Record<string, string> = {
          home: "홈팀",
          away: "원정팀",
          draw: "무",
          over: "오버",
          under: "언더",
        }

        const matches = slipPreds.map((p) => {
          const g = p.game as any
          let odds = 1
          let selection = ""
          if (p.prediction === "home") {
            odds = parseFloat(g?.home_win_odds) || 1
            selection = "홈팀"
          } else if (p.prediction === "away") {
            odds = parseFloat(g?.away_win_odds) || 1
            selection = "원정팀"
          } else if (p.prediction === "draw") {
            odds = parseFloat(g?.draw_odds) || 1
            selection = "무"
          } else if (p.prediction === "over") {
            odds = parseFloat(g?.over_odds) || 1
            selection = "오버"
          } else if (p.prediction === "under") {
            odds = parseFloat(g?.under_odds) || 1
            selection = "언더"
          }

          // Normalize result to per-match status
          const dbResult = g?.result as string | undefined
          let matchResult = "pending"
          if (dbResult) {
            matchResult = dbResult === p.prediction ? "win" : "lose"
          }
          const correctAnswer = dbResult ? resultLabelMap[dbResult] || dbResult : undefined

          return {
            league: g?.league_code || "",
            home: g?.home_team_name || "",
            away: g?.away_team_name || "",
            selection,
            odds: Math.round(odds * 100) / 100,
            homeOdds: Math.round((parseFloat(g?.home_win_odds) || 0) * 100) / 100,
            awayOdds: Math.round((parseFloat(g?.away_win_odds) || 0) * 100) / 100,
            drawOdds: Math.round((parseFloat(g?.draw_odds) || 0) * 100) / 100,
            overOdds: Math.round((parseFloat(g?.over_odds) || 0) * 100) / 100,
            underOdds: Math.round((parseFloat(g?.under_odds) || 0) * 100) / 100,
            result: matchResult,
            correctAnswer,
          }
        })

        return {
          slipId,
          sport,
          date: matchDate,
          status: slipStatus,
          stake,
          totalOdds: Math.round(totalOdds * 100) / 100,
          profit,
          matches,
        }
      })
    }

    // 8. 응답 조합
    const result = activities.map((act) => {
      const profile = profileMap.get(act.user_id)
      const stat = statsMap.get(act.user_id)
      const round = roundMap.get(act.round_id)
      const isPurchased = purchasedSet.has(act.id)
      const preds = predictionsMap.get(act.id) || []
      const isFree = isAllGamesExpired(preds)
      const showPredictions = isPurchased || isFree

      return {
        id: act.id,
        user_id: act.user_id,
        round_id: act.round_id,
        sport: act.sport,
        prediction_count: act.prediction_count,
        created_at: act.created_at,
        profile: profile
          ? {
              nickname: profile.nickname,
              avatar_url: profile.avatar_url,
            }
          : { nickname: "익명", avatar_url: null },
        stats: stat
          ? {
              accuracy: parseFloat(stat.accuracy) || 0,
              net_profit: parseFloat(stat.net_profit) || 0,
              current_streak: stat.current_streak || 0,
            }
          : null,
        round: round
          ? {
              year: round.year,
              round: round.round,
              status: round.status,
            }
          : null,
        is_purchased: isPurchased,
        is_free: isFree,
        predictions: showPredictions ? preds : null,
        slipGroups: showPredictions ? buildSlipGroups(preds) : null,
      }
    })

    return NextResponse.json({ activities: result })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
