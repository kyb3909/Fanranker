import { NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

/**
 * GET /api/betman/my-stats
 *
 * 현재 로그인 유저의 종목별 통계 전체 반환
 * Response: { stats: [...], summary: {...} }
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return apiUnauthorized()
    }

    const supabase = createAnonClient()

    const { data: stats, error } = await supabase
      .from('betman_user_sport_stats')
      .select('*')
      .eq('user_id', userId)
      .order('sport')

    if (error) {
      return NextResponse.json(
        { error: '통계 조회 실패' },
        { status: 500 }
      )
    }

    // '전체' 행을 summary로 분리
    const allStat = stats?.find(s => s.sport === '전체') || null
    const sportStats = stats?.filter(s => s.sport !== '전체') || []

    return NextResponse.json({
      summary: allStat ? {
        total_predictions: allStat.total_predictions,
        correct_predictions: allStat.correct_predictions,
        wrong_predictions: allStat.wrong_predictions,
        cancelled_predictions: allStat.cancelled_predictions,
        accuracy: parseFloat(allStat.accuracy) || 0,
        total_wagered: allStat.total_wagered,
        total_returns: parseFloat(allStat.total_returns) || 0,
        net_profit: parseFloat(allStat.net_profit) || 0,
        profit_rate: parseFloat(allStat.profit_rate) || 0,
        current_streak: allStat.current_streak,
        best_win_streak: allStat.best_win_streak,
        worst_lose_streak: allStat.worst_lose_streak,
      } : null,
      sports: sportStats.map(s => ({
        sport: s.sport,
        total_predictions: s.total_predictions,
        correct_predictions: s.correct_predictions,
        wrong_predictions: s.wrong_predictions,
        accuracy: parseFloat(s.accuracy) || 0,
        total_wagered: s.total_wagered,
        total_returns: parseFloat(s.total_returns) || 0,
        net_profit: parseFloat(s.net_profit) || 0,
        profit_rate: parseFloat(s.profit_rate) || 0,
        current_streak: s.current_streak,
        best_win_streak: s.best_win_streak,
      })),
    })
  } catch (e) {
    return apiError('서버 오류가 발생했습니다.', 500, e)
  }
}
