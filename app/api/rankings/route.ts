import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'

/**
 * GET /api/rankings
 * 
 * Get user rankings based on various metrics
 * 
 * Query Parameters:
 * - sort?: "profit" | "accuracy" | "roi" (default: "profit")
 * - sport?: "soccer" | "baseball" | "basketball" | "volleyball" | "all" (default: "all")
 * - limit?: number (default: 10)
 * - offset?: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const { searchParams } = new URL(request.url)

    const sort = searchParams.get('sort') || 'profit' // 'profit' | 'accuracy' | 'roi'
    const sportFilter = searchParams.get('sport') || 'all'
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Base query
    let query = supabase
      .from('user_prediction_stats')
      .select(`
        user_id,
        total_predictions,
        correct_predictions,
        accuracy,
        total_points,
        profit,
        roi,
        current_streak,
        longest_streak,
        profiles!inner(nickname, avatar_url)
      `)
      .gte('total_predictions', 1) // Only users with at least 1 prediction

    // Apply sport filter (if user_prediction_stats_by_sport table exists)
    // For now, we'll filter on client side or skip if table doesn't exist
    // TODO: Implement sport-specific filtering when user_prediction_stats_by_sport is available

    // Apply sorting
    let orderColumn: string
    let ascending: boolean

    switch (sort) {
      case 'accuracy':
        orderColumn = 'accuracy'
        ascending = false
        break
      case 'roi':
        orderColumn = 'roi'
        ascending = false
        break
      case 'profit':
      default:
        orderColumn = 'profit'
        ascending = false
        break
    }

    query = query
      .order(orderColumn, { ascending })
      .range(offset, offset + limit - 1)

    const { data: rankings, error } = await query

    if (error) {
      console.error('Failed to fetch rankings:', error)
      return NextResponse.json(
        { error: '랭킹 조회 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // Transform data to include profile info
    const transformedRankings = (rankings || []).map((item: any, index: number) => ({
      rank: offset + index + 1,
      user_id: item.user_id,
      nickname: item.profiles?.nickname || '익명',
      avatar_url: item.profiles?.avatar_url || null,
      total_predictions: item.total_predictions || 0,
      correct_predictions: item.correct_predictions || 0,
      accuracy: item.accuracy || 0,
      total_points: item.total_points || 0,
      profit: item.profit || 0,
      roi: item.roi || 0,
      current_streak: item.current_streak || 0,
      longest_streak: item.longest_streak || 0,
    }))

    return NextResponse.json({
      rankings: transformedRankings,
      sort,
      sport_filter: sportFilter,
      limit,
      offset,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
