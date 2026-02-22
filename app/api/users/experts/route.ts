import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'

/**
 * GET /api/users/experts
 * 
 * Get list of expert users, sorted by total profit (performance)
 * 
 * Query Parameters:
 * - sort?: "profit" | "accuracy" | "roi" (default: "profit")
 * - limit?: number (default: 20)
 * - offset?: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const { searchParams } = new URL(request.url)

    const sort = searchParams.get('sort') || 'profit' // 'profit' | 'accuracy' | 'roi'
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Join profiles with user_prediction_stats to get expert users with their stats
    let query = supabase
      .from('profiles')
      .select(`
        user_id,
        nickname,
        avatar_url,
        is_expert,
        expert_certified_at,
        user_prediction_stats!inner(
          total_predictions,
          correct_predictions,
          accuracy,
          total_points,
          profit,
          roi,
          current_streak,
          longest_streak
        )
      `)
      .eq('is_expert', true)
      .limit(limit)
      .range(offset, offset + limit - 1)

    // Apply sorting (order by user_prediction_stats fields)
    // Note: Supabase doesn't support direct ORDER BY on joined tables easily,
    // so we'll sort in application code after fetching
    const { data: experts, error } = await query

    if (error) {
      console.error('Failed to fetch experts:', error)
      return NextResponse.json(
        { error: '전문가 목록 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Transform and sort data
    const transformedExperts = (experts || [])
      .map((expert) => {
        // Supabase types inner-join as array; access first element at runtime
        const statsArr = expert.user_prediction_stats as unknown as Array<{
          total_predictions: number; correct_predictions: number; accuracy: number;
          total_points: number; profit: number; roi: number;
          current_streak: number; longest_streak: number;
        }>
        const stats = statsArr?.[0] || {} as Record<string, number>
        return {
          user_id: expert.user_id,
          nickname: expert.nickname || '익명',
          avatar_url: expert.avatar_url || null,
          is_expert: expert.is_expert,
          expert_certified_at: expert.expert_certified_at,
          total_predictions: stats.total_predictions || 0,
          correct_predictions: stats.correct_predictions || 0,
          accuracy: stats.accuracy || 0,
          total_points: stats.total_points || 0,
          profit: stats.profit || 0,
          roi: stats.roi || 0,
          current_streak: stats.current_streak || 0,
          longest_streak: stats.longest_streak || 0,
        }
      })
      .sort((a, b) => {
        switch (sort) {
          case 'accuracy':
            return (b.accuracy || 0) - (a.accuracy || 0)
          case 'roi':
            return (b.roi || 0) - (a.roi || 0)
          case 'profit':
          default:
            return (b.profit || 0) - (a.profit || 0)
        }
      })

    return NextResponse.json({
      experts: transformedExperts,
      sort,
      limit,
      offset,
      total: transformedExperts.length,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
