import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isWorldcupScoringSlip } from "@/lib/worldcup/scoring"

/**
 * GET /api/predictions/my
 *
 * Get current user's predictions with stats (from both predictions and betman_predictions)
 * Betman predictions are grouped by round_id to show as betting slips
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const offset = parseInt(searchParams.get("offset") || "0")
    const eventSlug = searchParams.get("event")

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const supabase = createServiceRoleClient()

    // ?event=<slug> → 그 이벤트(월드컵) 슬립만 조회. 없으면 일반 조회(이벤트 제외).
    let eventId: string | null = null
    if (eventSlug) {
      const { data: ev } = await supabase
        .from("events")
        .select("id")
        .eq("slug", eventSlug)
        .maybeSingle<{ id: string }>()
      eventId = ev?.id ?? null
    }

    // 1. Fetch regular predictions with match details
    const { data: regularPredictions, error: regularError } = await supabase
      .from("predictions")
      .select(
        `
        id,
        match_id,
        prediction_type,
        prediction_value,
        odds_at_prediction,
        points_wagered,
        is_correct,
        points_won,
        created_at,
        matches(
          id,
          match_time,
          time_status,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey(name_ko, name),
          away_team:teams!matches_away_team_id_fkey(name_ko, name),
          league:leagues!matches_league_id_fkey(name_ko, name)
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (regularError) {
      console.error("Failed to fetch regular predictions:", regularError)
    }

    // 2. Fetch betman predictions with game details, round info, AND slip info
    const { data: betmanPredictions, error: betmanError } = await supabase
      .from("betman_predictions")
      .select(
        `
        id,
        game_id,
        prediction,
        is_correct,
        points_earned,
        status,
        created_at,
        round_id,
        slip_id,
        stake,
        round:betman_rounds(
          id,
          year,
          round,
          deadline,
          status
        ),
        game:betman_games(
          id,
          game_no,
          match_time,
          sport,
          league_code,
          game_type,
          home_team_name,
          away_team_name,
          home_score,
          away_score,
          status,
          result,
          handicap,
          over_under_line,
          home_win_odds,
          away_win_odds,
          draw_odds,
          over_odds,
          under_odds
        ),
        slip:prediction_slips(
          id,
          stake,
          total_odds,
          status,
          event_id
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      // event 한정 조회는 슬립이 바운드돼 있어 넉넉히 받아 post-filter (limit cutoff 방지)
      .range(offset, offset + (eventSlug ? 500 : limit) - 1)

    if (betmanError) {
      console.error("Failed to fetch betman predictions:", betmanError)
    }

    // Transform regular predictions (individual items)
    // Supabase types FK joins as arrays; cast to single object at runtime
    interface MatchJoin {
      id: string
      match_time: string
      time_status: number
      home_score: number | null
      away_score: number | null
      home_team: { name_ko: string | null; name: string } | null
      away_team: { name_ko: string | null; name: string } | null
      league: { name_ko: string | null; name: string } | null
    }
    const transformedRegular = (regularPredictions || []).map((pred) => {
      const match = pred.matches as unknown as MatchJoin | null
      return {
        id: pred.id,
        matchId: pred.match_id,
        predictionType: pred.prediction_type,
        predictedValue: pred.prediction_value,
        oddsAtPrediction: pred.odds_at_prediction || 1,
        amount: pred.points_wagered || 1,
        isCorrect: pred.is_correct,
        pointsEarned: pred.points_won,
        createdAt: pred.created_at,
        source: "regular" as const,
        match: {
          homeTeam: match?.home_team?.name_ko || match?.home_team?.name || "홈팀",
          awayTeam: match?.away_team?.name_ko || match?.away_team?.name || "원정팀",
          league: match?.league?.name_ko || match?.league?.name || "리그",
          matchTime: match?.match_time,
          status: match?.time_status === 3 ? "finished" : "scheduled",
          homeScore: match?.home_score,
          awayScore: match?.away_score,
        },
      }
    })

    // Supabase types FK joins as arrays; define runtime shapes for betman joins
    interface BetmanGameJoin {
      id: string
      game_no: number
      match_time: string
      sport: string
      league_code: string | null
      game_type: string
      home_team_name: string
      away_team_name: string
      home_score: number | null
      away_score: number | null
      status: string
      result: string | null
      handicap: number | null
      over_under_line: number | null
      home_win_odds: number | null
      away_win_odds: number | null
      draw_odds: number | null
      over_odds: number | null
      under_odds: number | null
    }
    interface BetmanRoundJoin {
      id: string
      year: number
      round: number
      deadline: string | null
      status: string
    }
    interface BetmanSlipJoin {
      id: string
      stake: number
      total_odds: number
      status: string | null
      event_id: string | null
    }
    interface BetmanPred {
      id: string
      game_id: string
      prediction: string
      is_correct: boolean | null
      points_earned: number | null
      status: string | null
      created_at: string
      round_id: string | null
      slip_id: string | null
      stake: number | null
      round: BetmanRoundJoin | null
      game: BetmanGameJoin | null
      slip: BetmanSlipJoin | null
    }

    // Group betman predictions by slip_id (or round_id for legacy)
    const betmanPreds = (betmanPredictions || [])
      .map((p) => ({
        ...p,
        round: p.round as unknown as BetmanRoundJoin | null,
        game: p.game as unknown as BetmanGameJoin | null,
        slip: p.slip as unknown as BetmanSlipJoin | null,
      }))
      // ?event 있으면 그 이벤트 슬립만, 없으면 이벤트 슬립 제외 (메인 "내 예측")
      // 이벤트(월드컵) 한정 시: 정식 집계 시작(32강) 이전 슬립은 제외 → 리더보드와 일치.
      .filter((p) =>
        eventId
          ? p.slip?.event_id === eventId && isWorldcupScoringSlip(p.created_at)
          : !p.slip?.event_id
      ) as BetmanPred[]
    const betmanBySlip = new Map<string, BetmanPred[]>()
    for (const pred of betmanPreds) {
      const groupKey = pred.slip_id || pred.round_id || "unknown"
      if (!betmanBySlip.has(groupKey)) {
        betmanBySlip.set(groupKey, [])
      }
      betmanBySlip.get(groupKey)!.push(pred)
    }

    // Transform betman predictions into grouped betting slips
    const transformedBetmanSlips = Array.from(betmanBySlip.entries()).map(([groupKey, preds]) => {
      const firstPred = preds[0]
      const round = firstPred?.round
      const slip = firstPred?.slip
      const sport = firstPred?.game?.sport || "스포츠"

      // Use slip's total_odds if available, otherwise calculate
      const totalOdds =
        slip?.total_odds ||
        preds.reduce((acc: number, pred: BetmanPred) => {
          const game = pred.game
          let odds = 1
          if (pred.prediction === "home") odds = parseFloat(String(game?.home_win_odds)) || 1
          else if (pred.prediction === "away") odds = parseFloat(String(game?.away_win_odds)) || 1
          else if (pred.prediction === "draw") odds = parseFloat(String(game?.draw_odds)) || 1
          else if (pred.prediction === "over") odds = parseFloat(String(game?.over_odds)) || 1
          else if (pred.prediction === "under") odds = parseFloat(String(game?.under_odds)) || 1
          return acc * odds
        }, 1)

      // Calculate overall result
      const allSettled = preds.every((p: BetmanPred) => p.is_correct !== null)
      const allCorrect = preds.every((p: BetmanPred) => p.is_correct === true)
      const anyIncorrect = preds.some((p: BetmanPred) => p.is_correct === false)

      let overallResult: boolean | null = null
      if (allSettled) {
        overallResult = allCorrect
      } else if (anyIncorrect) {
        overallResult = false // One wrong means entire slip is wrong
      }

      // 적중 시 획득 = stake × total_odds (그로스 페이아웃) — 리더보드 손익·"예상" 표시와 동일.
      // (과거 Σ 픽별 배당(locked_odds)은 stake 무시 + 콤보 중복으로 실제와 어긋났음)
      const ballsUsed = Number(slip?.stake ?? firstPred?.stake ?? preds.length) || 0
      const totalPointsEarned = allCorrect
        ? Math.round(ballsUsed * Number(totalOdds) * 100) / 100
        : anyIncorrect
          ? 0
          : null

      // Transform individual games within the slip
      const games = preds.map((pred: BetmanPred) => {
        const game = pred.game
        let odds = 1
        if (pred.prediction === "home") odds = parseFloat(String(game?.home_win_odds)) || 1
        else if (pred.prediction === "away") odds = parseFloat(String(game?.away_win_odds)) || 1
        else if (pred.prediction === "draw") odds = parseFloat(String(game?.draw_odds)) || 1
        else if (pred.prediction === "over") odds = parseFloat(String(game?.over_odds)) || 1
        else if (pred.prediction === "under") odds = parseFloat(String(game?.under_odds)) || 1

        return {
          id: pred.id,
          gameId: pred.game_id,
          prediction: pred.prediction,
          isCorrect: pred.is_correct,
          odds: odds,
          gameType: game?.game_type || "일반",
          handicap: game?.handicap,
          overUnderLine: game?.over_under_line,
          result: game?.result || null,
          homeOdds: game?.home_win_odds || null,
          awayOdds: game?.away_win_odds || null,
          drawOdds: game?.draw_odds || null,
          overOdds: game?.over_odds || null,
          underOdds: game?.under_odds || null,
          match: {
            homeTeam: game?.home_team_name || "홈팀",
            awayTeam: game?.away_team_name || "원정팀",
            league: game?.league_code || "리그",
            matchTime: game?.match_time,
            status: game?.status === "completed" ? "finished" : game?.status || "scheduled",
            homeScore: game?.home_score,
            awayScore: game?.away_score,
          },
        }
      })

      return {
        id: groupKey,
        type: "sports_slip" as const,
        source: "sports" as const,
        sport: sport,
        roundInfo: round
          ? {
              year: round.year,
              round: round.round,
              deadline: round.deadline,
              status: round.status,
            }
          : null,
        gameCount: preds.length,
        totalOdds: totalOdds,
        ballsUsed,
        isCorrect: overallResult,
        // 취소된 슬립은 픽 is_correct가 영원히 null이라, status를 안 내리면
        // 화면에서 "대기중"으로 박제된다. 취소 여부를 명시적으로 내려준다.
        isCancelled: slip?.status === "cancelled",
        pointsEarned: totalPointsEarned,
        createdAt: firstPred?.created_at,
        games: games,
      }
    })

    // ?event 한정 시 일반(legacy) 예측은 제외 — 이벤트는 betman 슬립만.
    const regularForOutput = eventSlug ? [] : transformedRegular

    // Combine regular predictions and betman slips, sort by created_at
    const allItems = [...regularForOutput, ...transformedBetmanSlips].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // ───── 통계: 슬립(베팅) 단위 손익 — 리더보드와 동일 모델 ─────
    // 적중(won): 받은 += stake × total_odds, 쓴 볼 += stake
    // 미적중(lost): 쓴 볼 += stake
    // 취소(cancelled): 환불 → 통계 제외 / 대기(pending): 정산 전 → 손익 미반영(쓴 볼에도 미포함)
    // 적중률·획득점수(받은−쓴)·수익률 모두 슬립 단위 → 리더보드(평균 획득 점수)와 일치.
    // (과거: 픽 단위 Σ + amount:1 하드코딩 → stake 무시·콤보 중복·진 픽 배당 가산으로 불일치)
    const pickOdds = (pred: BetmanPred): number => {
      const g = pred.game
      switch (pred.prediction) {
        case "home":
          return parseFloat(String(g?.home_win_odds)) || 1
        case "away":
          return parseFloat(String(g?.away_win_odds)) || 1
        case "draw":
          return parseFloat(String(g?.draw_odds)) || 1
        case "over":
          return parseFloat(String(g?.over_odds)) || 1
        case "under":
          return parseFloat(String(g?.under_odds)) || 1
        default:
          return 1
      }
    }

    let totalPredictions = 0
    let correctPredictions = 0
    let settledCount = 0
    let totalPointsEarned = 0
    let totalPointsUsed = 0

    // 베팅 슬립 (betman / 월드컵) — 리더보드와 동일하게 슬립 status 기준
    for (const preds of betmanBySlip.values()) {
      const slip = preds[0]?.slip
      const stake = Number(slip?.stake ?? preds[0]?.stake ?? preds.length) || 0
      // 슬립 상태: DB status 우선, 없으면(legacy 라운드 그룹) 픽으로 추론
      let status = slip?.status ?? null
      if (!status) {
        const anyIncorrect = preds.some((p) => p.is_correct === false)
        const allSettled = preds.every((p) => p.is_correct !== null)
        status = anyIncorrect ? "lost" : allSettled ? "won" : "pending"
      }
      if (status === "cancelled") continue // 환불 — 통계 제외
      totalPredictions++
      if (status === "won") {
        const odds = Number(slip?.total_odds) || preds.reduce((a, p) => a * pickOdds(p), 1)
        totalPointsEarned += stake * odds
        totalPointsUsed += stake
        correctPredictions++
        settledCount++
      } else if (status === "lost") {
        totalPointsUsed += stake
        settledCount++
      }
      // pending → 카운트만, 손익 미반영
    }

    // 일반(legacy) 예측 — /my-predictions(비이벤트)에서만 포함
    for (const reg of regularForOutput) {
      totalPredictions++
      if (reg.isCorrect === null) continue
      settledCount++
      if (reg.isCorrect === true) {
        totalPointsEarned += Number(reg.pointsEarned) || 0
        totalPointsUsed += Number(reg.amount) || 0
        correctPredictions++
      } else {
        totalPointsUsed += Number(reg.amount) || 0
      }
    }

    const accuracy = settledCount > 0 ? (correctPredictions / settledCount) * 100 : 0
    totalPointsEarned = Math.round(totalPointsEarned * 100) / 100
    totalPointsUsed = Math.round(totalPointsUsed * 100) / 100

    return NextResponse.json({
      predictions: allItems,
      stats: {
        totalPredictions,
        correctPredictions,
        accuracy,
        totalPointsEarned,
        totalPointsUsed,
        settled: settledCount,
      },
      pagination: {
        limit,
        offset,
        hasMore: allItems.length >= limit,
      },
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
