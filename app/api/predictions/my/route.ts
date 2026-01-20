import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * GET /api/predictions/my
 *
 * Get current user's predictions with stats
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    // Fetch user's predictions with match details
    const { data: predictions, error: predictionsError } = await supabase
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

    if (predictionsError) {
      console.error('Failed to fetch predictions:', predictionsError)
      return NextResponse.json(
        { error: '예측 내역을 가져오는 중 오류가 발생했습니다.', details: predictionsError.message },
        { status: 500 }
      )
    }

    // Transform predictions
    const transformedPredictions = (predictions || []).map((pred: any) => ({
      id: pred.id,
      matchId: pred.match_id,
      predictionType: pred.prediction_type,
      predictedValue: pred.prediction_value,
      oddsAtPrediction: pred.odds_at_prediction || 1,
      amount: pred.points_wagered || 1,
      isCorrect: pred.is_correct,
      pointsEarned: pred.points_won,
      createdAt: pred.created_at,
      match: {
        homeTeam: pred.matches?.home_team?.name_ko || pred.matches?.home_team?.name || '홈팀',
        awayTeam: pred.matches?.away_team?.name_ko || pred.matches?.away_team?.name || '원정팀',
        league: pred.matches?.league?.name_ko || pred.matches?.league?.name || '리그',
        matchTime: pred.matches?.match_time,
        status: pred.matches?.time_status,
        homeScore: pred.matches?.home_score,
        awayScore: pred.matches?.away_score,
      },
    }))

    // Calculate stats
    const totalPredictions = transformedPredictions.length
    const settledPredictions = transformedPredictions.filter((p: any) => p.isCorrect !== null)
    const correctPredictions = transformedPredictions.filter((p: any) => p.isCorrect === true).length
    const accuracy = settledPredictions.length > 0 ? (correctPredictions / settledPredictions.length) * 100 : 0
    const totalPointsEarned = transformedPredictions.reduce((sum: number, p: any) => sum + (p.pointsEarned || 0), 0)
    const totalPointsUsed = transformedPredictions.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

    return NextResponse.json({
      predictions: transformedPredictions,
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
