import { SupabaseClient } from '@supabase/supabase-js'

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
  const { data: userPreds, error } = await supabase
    .from('betman_predictions')
    .select('id, is_correct, points_earned, status, betman_games(sport, match_time)')
    .eq('user_id', userId)
    .in('status', ['settled', 'cancelled'])

  if (error || !userPreds || userPreds.length === 0) return

  // match_time 기준 정렬 (연승/연패 계산용)
  userPreds.sort((a, b) => {
    const gameA = a.betman_games as unknown as { match_time: string }
    const gameB = b.betman_games as unknown as { match_time: string }
    return new Date(gameA?.match_time ?? 0).getTime() - new Date(gameB?.match_time ?? 0).getTime()
  })

  // 종목별 그룹핑
  const sportMap = new Map<string, {
    total: number; correct: number; wrong: number; cancelled: number
    totalReturns: number; results: boolean[]
  }>()

  const allResults: boolean[] = []
  let allTotal = 0, allCorrect = 0, allWrong = 0, allCancelled = 0, allReturns = 0

  for (const p of userPreds) {
    const game = p.betman_games as unknown as { sport: string; match_time: string }
    const sport = game?.sport ?? '기타'

    if (!sportMap.has(sport)) {
      sportMap.set(sport, { total: 0, correct: 0, wrong: 0, cancelled: 0, totalReturns: 0, results: [] })
    }
    const s = sportMap.get(sport)!
    s.total++
    allTotal++

    if (p.status === 'cancelled') {
      s.cancelled++
      allCancelled++
    } else if (p.is_correct === true) {
      s.correct++
      allCorrect++
      const earned = parseFloat(String(p.points_earned)) || 0
      s.totalReturns += earned
      allReturns += earned
      s.results.push(true)
      allResults.push(true)
    } else {
      s.wrong++
      allWrong++
      s.results.push(false)
      allResults.push(false)
    }
  }

  // 종목별 UPSERT
  for (const [sport, s] of sportMap) {
    const wagered = s.correct + s.wrong
    const accuracy = wagered > 0 ? (s.correct / wagered) * 100 : 0
    const netProfit = s.totalReturns - wagered
    const profitRate = wagered > 0 ? (netProfit / wagered) * 100 : 0
    const streaks = calculateStreaks(s.results)

    await supabase.from('betman_user_sport_stats').upsert({
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
    }, { onConflict: 'user_id,sport' })
  }

  // '전체' UPSERT
  const allWagered = allCorrect + allWrong
  const allAccuracy = allWagered > 0 ? (allCorrect / allWagered) * 100 : 0
  const allNetProfit = allReturns - allWagered
  const allProfitRate = allWagered > 0 ? (allNetProfit / allWagered) * 100 : 0
  const allStreaks = calculateStreaks(allResults)

  await supabase.from('betman_user_sport_stats').upsert({
    user_id: userId,
    sport: '전체',
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
  }, { onConflict: 'user_id,sport' })
}
