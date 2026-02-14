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

    // Determine sorting column
    let orderColumn: string
    switch (sort) {
      case 'accuracy':
        orderColumn = 'win_rate'
        break
      case 'roi':
        orderColumn = 'total_points'
        break
      case 'profit':
      default:
        orderColumn = 'points_won'
        break
    }

    // Fetch user prediction stats
    const { data: stats, error: statsError } = await supabase
      .from('user_prediction_stats')
      .select('*')
      .gte('total_predictions', 1)
      .order(orderColumn, { ascending: false })
      .range(offset, offset + limit - 1)

    if (statsError) {
      console.error('Failed to fetch stats:', statsError)
      return NextResponse.json(
        { error: '랭킹 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Get user IDs to fetch profiles
    const userIds = (stats || []).map((s: any) => s.user_id)

    // Fetch profiles separately
    let profiles: any[] = []
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url')
        .in('user_id', userIds)

      profiles = profilesData || []
    }

    // Create a map for quick lookup
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]))

    // Transform data to include profile info
    const transformedRankings = (stats || []).map((item: any, index: number) => {
      const profile = profileMap.get(item.user_id)
      return {
        rank: offset + index + 1,
        user_id: item.user_id,
        nickname: profile?.nickname || '익명',
        avatar_url: profile?.avatar_url || null,
        total_predictions: item.total_predictions || 0,
        correct_predictions: item.correct_predictions || 0,
        accuracy: item.win_rate || 0,
        total_points: item.total_points || 0,
        profit: item.points_won || 0,
        roi: item.win_rate || 0,
        current_streak: item.current_streak || 0,
        longest_streak: item.best_win_streak || 0,
      }
    })

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
