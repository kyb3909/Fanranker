import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * GET /api/predictions/feed
 * 
 * Get expert predictions feed (for subscription feed tab)
 * 
 * Query Parameters:
 * - sport?: "soccer" | "baseball" | "basketball" | "volleyball" | "all" (default: "all")
 * - sort?: "newest" | "popular" (default: "newest")
 * - limit?: number (default: 20)
 * - offset?: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    const userId = user?.id || null

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const sportFilter = searchParams.get('sport') || 'all'
    const sort = searchParams.get('sort') || 'newest'
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Only fetch predictions from experts who have analysis_text
    let query = supabase
      .from('predictions')
      .select(`
        id,
        user_id,
        match_id,
        prediction_type,
        predicted_value,
        odds_at_prediction,
        analysis_text,
        is_premium,
        price,
        created_at,
        profiles!inner(
          user_id,
          nickname,
          avatar_url,
          is_expert
        ),
        matches!inner(
          id,
          match_time,
          sport_type,
          home_team:teams!matches_home_team_id_fkey(id, name, name_ko),
          away_team:teams!matches_away_team_id_fkey(id, name, name_ko),
          league:leagues!matches_league_id_fkey(id, name, name_ko)
        )
      `)
      .not('analysis_text', 'is', null) // Only predictions with analysis (expert predictions)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply sport filter
    if (sportFilter !== 'all') {
      const sportMap: Record<string, string> = {
        soccer: 'football',
        baseball: 'baseball',
        basketball: 'basketball',
        volleyball: 'volleyball',
      }
      const sportType = sportMap[sportFilter]
      if (sportType) {
        query = query.eq('matches.sport_type', sportType)
      }
    }

    // Apply sorting
    if (sort === 'popular') {
      // TODO: Sort by popularity (prediction count, likes, etc.)
      // For now, keep newest order
    }

    const { data: predictions, error } = await query

    if (error) {
      console.error('Failed to fetch predictions feed:', error)
      return NextResponse.json(
        { error: '예측 피드를 가져오는 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // Check purchase/subscription status for premium content
    const transformedPredictions = await Promise.all(
      (predictions || []).map(async (pred: any) => {
        let hasAccess = false
        if (pred.is_premium && userId) {
          // Check if user has purchased or subscribed
          const { data: purchase } = await supabase
            .from('purchased_content')
            .select('id')
            .eq('user_id', userId)
            .eq('prediction_id', pred.id)
            .single()

          const { data: subscription } = await supabase
            .rpc('is_subscription_active', {
              p_subscriber_id: userId,
              p_expert_id: pred.user_id,
            })

          hasAccess = !!purchase || !!subscription
        } else if (!pred.is_premium) {
          hasAccess = true // Free content is accessible to everyone
        }

        // Transform data to match expected format
        return {
          id: pred.id,
          user: {
            name: pred.profiles?.nickname || '익명',
            avatar: pred.profiles?.avatar_url || '/placeholder-user.jpg',
            roi: 0, // TODO: Get from user stats
            winRate: 0, // TODO: Get from user stats
          },
          timestamp: new Date(pred.created_at).toISOString(),
          predictions: [
            {
              matchId: pred.match_id,
              selection: pred.predicted_value, // 'home', 'draw', 'away'
              odds: pred.odds_at_prediction || 0,
            },
          ],
          analysis: pred.analysis_text || '',
          is_premium: pred.is_premium || false,
          price: pred.price || null,
          hasAccess,
          match: pred.matches?.[0] || null, // Match details
        }
      })
    )

    return NextResponse.json({
      predictions: transformedPredictions,
      total: transformedPredictions.length,
      limit,
      offset,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
