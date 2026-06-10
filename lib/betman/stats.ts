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
async function updateUserSportStats(supabase: SupabaseClient, userId: string) {
  // 1. 개별 예측 조회
  const { data: userPreds, error: predsError } = await supabase
    .from("betman_predictions")
    .select("id, is_correct, status, slip_id, betman_games(sport)")
    .eq("user_id", userId)
    .in("status", ["settled", "cancelled"])

  if (predsError || !userPreds || userPreds.length === 0) return

  // 이벤트(월드컵 등) 슬립은 메인 통계에서 제외 — 온보딩/이벤트 베팅 격리.
  const { data: eventSlips } = await supabase
    .from("prediction_slips")
    .select("id")
    .eq("user_id", userId)
    .not("event_id", "is", null)
  const eventSlipIds = new Set((eventSlips ?? []).map((s) => s.id))

  // 2. 예측의 slip_id로 슬립 조회 (user_id 불일치 방어)
  const slipIds = [...new Set(userPreds.map((p) => p.slip_id).filter(Boolean))]
  let userSlips: Array<{
    id: string
    sport: string | null
    stake: number | null
    total_odds: number | null
    status: string
    created_at: string
  }> | null = []

  if (slipIds.length > 0) {
    const { data, error: slipsError } = await supabase
      .from("prediction_slips")
      .select("id, sport, stake, total_odds, status, created_at")
      .in("id", slipIds)
      .in("status", ["won", "lost", "cancelled"])
      .is("event_id", null) // 이벤트 슬립 제외
      .order("created_at", { ascending: true })
    if (slipsError) return
    userSlips = data
  }

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
    // 이벤트 슬립에 속한 예측은 메인 통계에서 제외
    if (p.slip_id && eventSlipIds.has(p.slip_id)) continue
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

    if (slip.status === "cancelled") continue

    s.totalWagered += stake
    allWagered += stake

    if (slip.status === "won") {
      const returns = Math.round(stake * (slip.total_odds ?? 1) * 100) / 100
      s.totalReturns += returns
      allReturns += returns
      s.results.push(true)
      allResults.push(true)
    } else {
      s.results.push(false)
      allResults.push(false)
    }
  }

  // 3. 종목별 + 전체 UPSERT를 배치로 수집 후 병렬 실행
  const upsertRows: Record<string, unknown>[] = []

  for (const [sport, s] of sportMap) {
    const totalActive = s.correct + s.wrong
    const accuracy = totalActive > 0 ? (s.correct / totalActive) * 100 : 0
    const netProfit = s.totalReturns - s.totalWagered
    const profitRate = s.totalWagered > 0 ? (netProfit / s.totalWagered) * 100 : 0
    const streaks = calculateStreaks(s.results)

    upsertRows.push({
      user_id: userId,
      sport,
      total_predictions: s.total,
      correct_predictions: s.correct,
      wrong_predictions: s.wrong,
      cancelled_predictions: s.cancelled,
      accuracy: Math.round(accuracy * 100) / 100,
      total_wagered: s.totalWagered,
      total_returns: Math.round(s.totalReturns * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      profit_rate: Math.round(profitRate * 100) / 100,
      current_streak: streaks.currentStreak,
      best_win_streak: streaks.bestWin,
      worst_lose_streak: streaks.worstLose,
      updated_at: new Date().toISOString(),
    })
  }

  // "전체" 행
  const allTotalActive = allCorrect + allWrong
  const allAccuracy = allTotalActive > 0 ? (allCorrect / allTotalActive) * 100 : 0
  const allNetProfit = allReturns - allWagered
  const allProfitRate = allWagered > 0 ? (allNetProfit / allWagered) * 100 : 0
  const allStreaks = calculateStreaks(allResults)

  upsertRows.push({
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
  })

  // 단일 배치 upsert (N개 행을 1번의 DB 호출로)
  await supabase.from("betman_user_sport_stats").upsert(upsertRows, { onConflict: "user_id,sport" })
}

/**
 * 여러 유저의 통계를 병렬로 재계산 (동시 concurrency명씩)
 */
export async function batchUpdateUserStats(
  supabase: SupabaseClient,
  userIds: string[],
  concurrency = 10
): Promise<{ updated: number; errors: string[] }> {
  let updated = 0
  const errors: string[] = []

  for (let i = 0; i < userIds.length; i += concurrency) {
    const batch = userIds.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      batch.map((userId) => updateUserSportStats(supabase, userId))
    )
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        updated++
      } else {
        errors.push(`user=${batch[j]}: ${(results[j] as PromiseRejectedResult).reason?.message}`)
      }
    }
  }

  return { updated, errors }
}
