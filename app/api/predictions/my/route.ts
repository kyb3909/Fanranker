import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

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
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    // 1. Fetch regular predictions with match details
    const { data: regularPredictions, error: regularError } = await supabase
      .from('predictions')
      .select(`
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
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (regularError) {
      console.error('Failed to fetch regular predictions:', regularError)
    }

    // 2. Fetch betman predictions with game details AND round info
    const { data: betmanPredictions, error: betmanError } = await supabase
      .from('betman_predictions')
      .select(`
        id,
        game_id,
        prediction,
        is_correct,
        points_earned,
        status,
        created_at,
        round_id,
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
          handicap,
          over_under_line,
          home_win_odds,
          away_win_odds,
          draw_odds,
          over_odds,
          under_odds
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (betmanError) {
      console.error('Failed to fetch betman predictions:', betmanError)
    }

    // Transform regular predictions (individual items)
    const transformedRegular = (regularPredictions || []).map((pred: any) => ({
      id: pred.id,
      matchId: pred.match_id,
      predictionType: pred.prediction_type,
      predictedValue: pred.prediction_value,
      oddsAtPrediction: pred.odds_at_prediction || 1,
      amount: pred.points_wagered || 1,
      isCorrect: pred.is_correct,
      pointsEarned: pred.points_won,
      createdAt: pred.created_at,
      source: 'regular',
      match: {
        homeTeam: pred.matches?.home_team?.name_ko || pred.matches?.home_team?.name || '홈팀',
        awayTeam: pred.matches?.away_team?.name_ko || pred.matches?.away_team?.name || '원정팀',
        league: pred.matches?.league?.name_ko || pred.matches?.league?.name || '리그',
        matchTime: pred.matches?.match_time,
        status: pred.matches?.time_status === 3 ? 'finished' : 'scheduled',
        homeScore: pred.matches?.home_score,
        awayScore: pred.matches?.away_score,
      },
    }))

    // Group betman predictions by round_id for betting slip display
    const betmanByRound = new Map<string, any[]>()
    for (const pred of (betmanPredictions || [])) {
      const roundId = pred.round_id || 'unknown'
      if (!betmanByRound.has(roundId)) {
        betmanByRound.set(roundId, [])
      }
      betmanByRound.get(roundId)!.push(pred)
    }

    // Transform betman predictions into grouped betting slips
    const transformedBetmanSlips = Array.from(betmanByRound.entries()).map(([roundId, preds]) => {
      const firstPred = preds[0]
      const round = firstPred?.round
      const sport = firstPred?.game?.sport || '스포츠'

      // Calculate combined odds
      const totalOdds = preds.reduce((acc: number, pred: any) => {
        const game = pred.game
        let odds = 1
        if (pred.prediction === 'home') odds = parseFloat(game?.home_win_odds) || 1
        else if (pred.prediction === 'away') odds = parseFloat(game?.away_win_odds) || 1
        else if (pred.prediction === 'draw') odds = parseFloat(game?.draw_odds) || 1
        else if (pred.prediction === 'over') odds = parseFloat(game?.over_odds) || 1
        else if (pred.prediction === 'under') odds = parseFloat(game?.under_odds) || 1
        return acc * odds
      }, 1)

      // Calculate overall result
      const allSettled = preds.every((p: any) => p.is_correct !== null)
      const allCorrect = preds.every((p: any) => p.is_correct === true)
      const anyIncorrect = preds.some((p: any) => p.is_correct === false)

      let overallResult: boolean | null = null
      if (allSettled) {
        overallResult = allCorrect
      } else if (anyIncorrect) {
        overallResult = false // One wrong means entire slip is wrong
      }

      // Calculate total points earned (only if all correct)
      const totalPointsEarned = allCorrect
        ? preds.reduce((sum: number, p: any) => sum + (p.points_earned || 0), 0)
        : anyIncorrect ? 0 : null

      // Transform individual games within the slip
      const games = preds.map((pred: any) => {
        const game = pred.game
        let odds = 1
        if (pred.prediction === 'home') odds = parseFloat(game?.home_win_odds) || 1
        else if (pred.prediction === 'away') odds = parseFloat(game?.away_win_odds) || 1
        else if (pred.prediction === 'draw') odds = parseFloat(game?.draw_odds) || 1
        else if (pred.prediction === 'over') odds = parseFloat(game?.over_odds) || 1
        else if (pred.prediction === 'under') odds = parseFloat(game?.under_odds) || 1

        return {
          id: pred.id,
          gameId: pred.game_id,
          prediction: pred.prediction,
          isCorrect: pred.is_correct,
          odds: odds,
          gameType: game?.game_type || '일반',
          handicap: game?.handicap,
          overUnderLine: game?.over_under_line,
          match: {
            homeTeam: game?.home_team_name || '홈팀',
            awayTeam: game?.away_team_name || '원정팀',
            league: game?.league_code || '리그',
            matchTime: game?.match_time,
            status: game?.status === 'completed' ? 'finished' : game?.status || 'scheduled',
            homeScore: game?.home_score,
            awayScore: game?.away_score,
          }
        }
      })

      return {
        id: roundId,
        type: 'betman_slip',
        source: 'betman',
        sport: sport,
        roundInfo: round ? {
          year: round.year,
          round: round.round,
          deadline: round.deadline,
          status: round.status,
        } : null,
        gameCount: preds.length,
        totalOdds: totalOdds,
        ballsUsed: preds.length, // Each game = 1 ball
        isCorrect: overallResult,
        pointsEarned: totalPointsEarned,
        createdAt: firstPred?.created_at,
        games: games,
      }
    })

    // Also keep individual betman predictions for stats calculation
    const flatBetmanPredictions = (betmanPredictions || []).map((pred: any) => {
      const game = pred.game
      let odds = 1
      if (pred.prediction === 'home') odds = parseFloat(game?.home_win_odds) || 1
      else if (pred.prediction === 'away') odds = parseFloat(game?.away_win_odds) || 1
      else if (pred.prediction === 'draw') odds = parseFloat(game?.draw_odds) || 1
      else if (pred.prediction === 'over') odds = parseFloat(game?.over_odds) || 1
      else if (pred.prediction === 'under') odds = parseFloat(game?.under_odds) || 1

      return {
        id: pred.id,
        isCorrect: pred.is_correct,
        pointsEarned: pred.points_earned,
        amount: 1,
      }
    })

    // Combine regular predictions and betman slips, sort by created_at
    const allItems = [...transformedRegular, ...transformedBetmanSlips]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Calculate stats from all individual predictions
    const allIndividualPredictions = [...transformedRegular, ...flatBetmanPredictions]
    const totalPredictions = allIndividualPredictions.length
    const settledPredictions = allIndividualPredictions.filter((p: any) => p.isCorrect !== null)
    const correctPredictions = allIndividualPredictions.filter((p: any) => p.isCorrect === true).length
    const accuracy = settledPredictions.length > 0 ? (correctPredictions / settledPredictions.length) * 100 : 0
    const totalPointsEarned = allIndividualPredictions.reduce((sum: number, p: any) => sum + (p.pointsEarned || 0), 0)
    const totalPointsUsed = allIndividualPredictions.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

    return NextResponse.json({
      predictions: allItems,
      stats: {
        totalPredictions,
        correctPredictions,
        accuracy,
        totalPointsEarned,
        totalPointsUsed,
      },
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
