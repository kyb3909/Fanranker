import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { isAdmin } from "@/lib/supabase/admin"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const settleSchema = z.object({
  match_id: z.string().min(1, "경기 ID가 필요합니다."),
  force: z.boolean().optional(),
})

/**
 * Helper function to update user stats after prediction settlement
 */
async function updateUserStats(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  isCorrect: boolean,
  pointsEarned: number,
  tokensSpent: number = 100 // Default: assume 100 tokens per prediction
) {
  // Get current stats or create new
  const { data: existingStats } = await supabase
    .from("user_prediction_stats")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (!existingStats) {
    // Create initial stats
    const { error: createError } = await supabase.from("user_prediction_stats").insert({
      user_id: userId,
      total_predictions: 1,
      correct_predictions: isCorrect ? 1 : 0,
      accuracy: isCorrect ? 100 : 0,
      total_points: pointsEarned,
      total_tokens_spent: tokensSpent,
      profit: pointsEarned - tokensSpent,
      roi: tokensSpent > 0 ? ((pointsEarned - tokensSpent) / tokensSpent) * 100 : 0,
      current_streak: isCorrect ? 1 : 0,
      longest_streak: isCorrect ? 1 : 0,
      level: 1,
      badges: [],
    })

    if (createError) {
      console.error("Failed to create user stats:", createError)
    }
  } else {
    // Update existing stats
    const newTotalPredictions = (existingStats.total_predictions || 0) + 1
    const newCorrectPredictions = (existingStats.correct_predictions || 0) + (isCorrect ? 1 : 0)
    const newAccuracy =
      newTotalPredictions > 0 ? (newCorrectPredictions / newTotalPredictions) * 100 : 0
    const newTotalPoints = (existingStats.total_points || 0) + pointsEarned
    const newTotalTokensSpent = (existingStats.total_tokens_spent || 0) + tokensSpent
    const newProfit = newTotalPoints - newTotalTokensSpent
    const newRoi = newTotalTokensSpent > 0 ? (newProfit / newTotalTokensSpent) * 100 : 0

    // Update streak
    let newCurrentStreak = existingStats.current_streak || 0
    let newLongestStreak = existingStats.longest_streak || 0

    if (isCorrect) {
      newCurrentStreak += 1
      newLongestStreak = Math.max(newLongestStreak, newCurrentStreak)
    } else {
      newCurrentStreak = 0
    }

    const { error: updateError } = await supabase
      .from("user_prediction_stats")
      .update({
        total_predictions: newTotalPredictions,
        correct_predictions: newCorrectPredictions,
        accuracy: newAccuracy,
        total_points: newTotalPoints,
        total_tokens_spent: newTotalTokensSpent,
        profit: newProfit,
        roi: newRoi,
        current_streak: newCurrentStreak,
        longest_streak: newLongestStreak,
      })
      .eq("user_id", userId)

    if (updateError) {
      console.error("Failed to update user stats:", updateError)
    }
  }
}

/**
 * POST /api/predictions/settle
 *
 * Settle predictions for a specific match
 * Updates is_correct and points_earned for all predictions related to the match
 *
 * Body:
 * - match_id: string (required) - Match ID to settle
 * - force?: boolean - Force settlement even if already settled
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    // Admin-only: settlement affects all users' points and stats
    const admin = await isAdmin()
    if (!admin) {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const supabase = createServiceRoleClient()
    const body = await request.json()
    const parsed = settleSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { match_id, force } = parsed.data

    // Get match data
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, time_status, score_home, score_away, is_settled, sport_type")
      .eq("id", match_id)
      .single()

    if (matchError || !match) {
      return NextResponse.json({ error: "경기를 찾을 수 없습니다." }, { status: 404 })
    }

    // Check if match is finished (time_status = 3)
    if (match.time_status !== 3) {
      return apiBadRequest(
        "경기가 아직 종료되지 않았습니다. (time_status: " + match.time_status + ")"
      )
    }

    // Check if already settled
    if (match.is_settled && !force) {
      return NextResponse.json(
        { error: "이미 정산된 경기입니다.", already_settled: true },
        { status: 400 }
      )
    }

    // Check if scores are available
    if (match.score_home === null || match.score_away === null) {
      return apiBadRequest("경기 결과(스코어)가 없습니다.")
    }

    // Get all predictions for this match
    const { data: predictions, error: predictionsError } = await supabase
      .from("predictions")
      .select("id, user_id, prediction_type, predicted_value, odds_at_prediction")
      .eq("match_id", match_id)
      .is("is_correct", null) // Only unsettled predictions

    if (predictionsError) {
      return apiError("예측 조회 중 오류가 발생했습니다.", 500, predictionsError)
    }

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "정산할 예측이 없습니다.",
        settled_count: 0,
      })
    }

    // Calculate actual result based on prediction_type
    const homeScore = match.score_home
    const awayScore = match.score_away
    const totalGoals = homeScore + awayScore
    const bothScored = homeScore > 0 && awayScore > 0

    // Determine actual result for each prediction type
    let actualResult: {
      full_time_result?: "home" | "draw" | "away"
      goals_over_under?: boolean // true if over, false if under
      both_teams_to_score?: boolean
    } = {}

    // Full time result
    if (homeScore > awayScore) {
      actualResult.full_time_result = "home"
    } else if (homeScore < awayScore) {
      actualResult.full_time_result = "away"
    } else {
      actualResult.full_time_result = "draw"
    }

    // Process each prediction
    let settledCount = 0
    let errorCount = 0

    // Group predictions by user_id for batch stats update
    const userStatsMap = new Map<string, { correct: number; points: number; tokensSpent: number }>()

    for (const prediction of predictions) {
      let isCorrect = false
      let pointsEarned = 0

      // Evaluate prediction based on type
      switch (prediction.prediction_type) {
        case "full_time_result":
          // predicted_value should be 'home', 'draw', or 'away'
          isCorrect = prediction.predicted_value === actualResult.full_time_result
          break

        case "goals_over_under":
          // predicted_value should be a number (threshold), e.g., "2.5"
          const threshold = parseFloat(prediction.predicted_value as string)
          if (!isNaN(threshold)) {
            const isOver = totalGoals > threshold
            // Assume predicted_value format: "over:2.5" or "under:2.5"
            const predictedStr = String(prediction.predicted_value).toLowerCase()
            const isOverPrediction = predictedStr.startsWith("over")
            isCorrect = isOver === isOverPrediction
            actualResult.goals_over_under = isOver
          }
          break

        case "both_teams_to_score":
          // predicted_value should be 'yes' or 'no'
          const predictedBTTS = String(prediction.predicted_value).toLowerCase()
          isCorrect =
            (predictedBTTS === "yes" && bothScored) || (predictedBTTS === "no" && !bothScored)
          actualResult.both_teams_to_score = bothScored
          break

        default:
          console.warn(`Unknown prediction_type: ${prediction.prediction_type}`)
          continue
      }

      // Calculate points earned (only if correct)
      // 기본 베팅 금액 100 (향후 token_transactions에서 실제 금액 조회 가능)
      const tokensSpent = 100
      if (isCorrect && prediction.odds_at_prediction) {
        pointsEarned = Math.floor(tokensSpent * prediction.odds_at_prediction)
      }

      // Update prediction
      const { error: updateError } = await supabase
        .from("predictions")
        .update({
          is_correct: isCorrect,
          points_earned: pointsEarned,
        })
        .eq("id", prediction.id)

      if (updateError) {
        console.error(`Failed to update prediction ${prediction.id}:`, updateError)
        errorCount++
      } else {
        settledCount++

        // Accumulate stats for batch update
        const current = userStatsMap.get(prediction.user_id) || {
          correct: 0,
          points: 0,
          tokensSpent: 0,
        }
        userStatsMap.set(prediction.user_id, {
          correct: current.correct + (isCorrect ? 1 : 0),
          points: current.points + pointsEarned,
          tokensSpent: current.tokensSpent + tokensSpent,
        })
      }
    }

    // Update user stats for all affected users
    for (const [userId, stats] of userStatsMap.entries()) {
      await updateUserStats(supabase, userId, stats.correct > 0, stats.points, stats.tokensSpent)
    }

    // Update match settlement status
    if (settledCount > 0) {
      const { error: matchUpdateError } = await supabase
        .from("matches")
        .update({ is_settled: true })
        .eq("id", match_id)

      if (matchUpdateError) {
        console.error("Failed to update match settlement status:", matchUpdateError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `정산 완료: ${settledCount}개 예측 처리됨`,
      settled_count: settledCount,
      error_count: errorCount,
      total_predictions: predictions.length,
      actual_result: actualResult,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * GET /api/predictions/settle
 *
 * Get settlement status for a match or list of unsettled matches
 *
 * Query Parameters:
 * - match_id?: string - Specific match ID
 * - unsettled_only?: boolean - List all unsettled matches
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await isAdmin()
    if (!admin) {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const matchId = searchParams.get("match_id")
    const unsettledOnly = searchParams.get("unsettled_only") === "true"

    if (matchId) {
      // Get specific match settlement status
      const { data: match, error } = await supabase
        .from("matches")
        .select("id, time_status, score_home, score_away, is_settled")
        .eq("id", matchId)
        .single()

      if (error || !match) {
        return NextResponse.json({ error: "경기를 찾을 수 없습니다." }, { status: 404 })
      }

      // Count predictions for this match
      const { count } = await supabase
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("match_id", matchId)

      const { count: settledCount } = await supabase
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("match_id", matchId)
        .not("is_correct", "is", null)

      return NextResponse.json({
        match_id: match.id,
        time_status: match.time_status,
        is_settled: match.is_settled,
        has_score: match.score_home !== null && match.score_away !== null,
        total_predictions: count || 0,
        settled_predictions: settledCount || 0,
      })
    }

    if (unsettledOnly) {
      // List all finished but unsettled matches
      const { data: matches, error } = await supabase
        .from("matches")
        .select("id, match_time, time_status, score_home, score_away, is_settled")
        .eq("time_status", 3) // Finished
        .eq("is_settled", false)
        .order("match_time", { ascending: false })
        .limit(50)

      if (error) {
        return NextResponse.json({ error: "경기 조회 중 오류가 발생했습니다." }, { status: 500 })
      }

      return NextResponse.json({ matches: matches || [] })
    }

    return apiBadRequest("match_id 또는 unsettled_only 파라미터가 필요합니다.")
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
