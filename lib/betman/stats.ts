import { SupabaseClient } from "@supabase/supabase-js"

/** 연승/연패 계산 */
export function calculateStreaks(results: boolean[]) {
  let currentStreak = 0
  let bestWin = 0
  let worstLose = 0

  for (const isCorrect of results) {
    if (isCorrect) {
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1
      bestWin = Math.max(bestWin, currentStreak)
    } else {
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1
      worstLose = Math.max(worstLose, Math.abs(currentStreak))
    }
  }

  return { currentStreak, bestWin, worstLose }
}

/** 유저의 종목별 + 전체 통계를 재계산하여 UPSERT */
export async function updateUserSportStats(supabase: SupabaseClient, userId: string) {
  // 1. 개별 예측 → 적중/오답/취소 카운트 (정확도 계산용)
  const { data: userPreds, error } = await supabase
    .from("betman_predictions")
    .select("id, is_correct, status, betman_games(sport)")
    .eq("user_id", userId)
    .in("status", ["settled", "cancelled"])

  if (error || !userPreds || userPreds.length === 0) return

  // 2. 슬립 → 배팅금액/수익금/연승 계산 (슬립 단위가 정확한 기준)
  const { data: userSlips, error: slipError } = await supabase
    .from("prediction_slips")
    .select("id, sport, stake, total_odds, status, created_at")
    .eq("user_id", userId)
    .in("status", ["won", "lost", "cancelled"])
    .order("created_at", { ascending: true })

  if (slipError) return

  // 종목별 그룹핑
  const sportMap = new Map<
    string,
    {
      total: number
      correct: number
      wrong: number
      cancelled: number
      totalWagered: number
      totalReturns: number
      results: boolean[]
    }
  >()

  const ensureSport = (sport: string) => {
    if (!sportMap.has(sport)) {
      sportMap.set(sport, {
        total: 0,
        correct: 0,
        wrong: 0,
        cancelled: 0,
        totalWagered: 0,
        totalReturns: 0,
        results: [],
      })
    }
    return sportMap.get(sport)!
  }

  // 2a. 개별 예측에서 적중/오답/취소 카운트 집계
  let allTotal = 0,
    allCorrect = 0,
    allWrong = 0,
    allCancelled = 0

  for (const p of userPreds) {
    const game = p.betman_games as unknown as { sport: string }
    const sport = game?.sport ?? "기타"
    const s = ensureSport(sport)
    s.total++
    allTotal++

    if (p.status === "cancelled") {
      s.cancelled++
      allCancelled++
    } else if (p.is_correct === true) {
      s.correct++
      allCorrect++
    } else {
      s.wrong++
      allWrong++
    }
  }

  // 2b. 슬립에서 배팅금액/수익금/연승 집계
  const allResults: boolean[] = []
  let allWagered = 0,
    allReturns = 0

  for (const slip of userSlips || []) {
    const sport = slip.sport ?? "기타"
    const s = ensureSport(sport)
    const stake = slip.stake ?? 1

    if (slip.status === "cancelled") {
      // 취소 슬립: 배팅금/수익 없음, 연승에도 영향 없음
      continue
    }

    // won/lost 슬립만 배팅금 집계
    s.totalWagered += stake
    allWagered += stake

    if (slip.status === "won") {
      const returns = Math.round(stake * (slip.total_odds ?? 1) * 100) / 100
      s.totalReturns += returns
      allReturns += returns
      s.results.push(true)
      allResults.push(true)
    } else {
      // lost
      s.results.push(false)
      allResults.push(false)
    }
  }

  // 종목별 UPSERT
  for (const [sport, s] of sportMap) {
    const wagered = s.totalWagered
    const totalActive = s.correct + s.wrong
    const accuracy = totalActive > 0 ? (s.correct / totalActive) * 100 : 0
    const netProfit = s.totalReturns - wagered
    const profitRate = wagered > 0 ? (netProfit / wagered) * 100 : 0
    const streaks = calculateStreaks(s.results)

    await supabase.from("betman_user_sport_stats").upsert(
      {
        user_id: userId,
        sport,
        total_predictions: s.total,
        correct_predictions: s.correct,
        wrong_predictions: s.wrong,
        cancelled_predictions: s.cancelled,
        accuracy: Math.round(accuracy * 100) / 100,
        total_wagered: wagered,
        total_returns: Math.round(s.totalReturns * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        profit_rate: Math.round(profitRate * 100) / 100,
        current_streak: streaks.currentStreak,
        best_win_streak: streaks.bestWin,
        worst_lose_streak: streaks.worstLose,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,sport" }
    )
  }

  // '전체' UPSERT
  const allTotalActive = allCorrect + allWrong
  const allAccuracy = allTotalActive > 0 ? (allCorrect / allTotalActive) * 100 : 0
  const allNetProfit = allReturns - allWagered
  const allProfitRate = allWagered > 0 ? (allNetProfit / allWagered) * 100 : 0
  const allStreaks = calculateStreaks(allResults)

  await supabase.from("betman_user_sport_stats").upsert(
    {
      user_id: userId,
      sport: "전체",
      total_predictions: allTotal,
      correct_predictions: allCorrect,
      wrong_predictions: allWrong,
      cancelled_predictions: allCancelled,
      accuracy: Math.round(allAccuracy * 100) / 100,
      total_wagered: allWagered,
      total_returns: Math.round(allReturns * 100) / 100,
      net_profit: Math.round(allNetProfit * 100) / 100,
      profit_rate: Math.round(allProfitRate * 100) / 100,
      current_streak: allStreaks.currentStreak,
      best_win_streak: allStreaks.bestWin,
      worst_lose_streak: allStreaks.worstLose,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,sport" }
  )
}
