import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * GET /api/feed/predictions
 *
 * 팔로우한 유저들의 예측 활동 피드
 * 각 activity에 대해 구매 여부 체크, 구매한 경우 예측 데이터 포함
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

    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const offset = parseInt(searchParams.get('offset') || '0')

    // 1. 팔로우하는 유저 목록
    const { data: follows } = await supabase
      .from('user_follows')
      .select('followed_user_id')
      .eq('follower_id', user.id)

    if (!follows || follows.length === 0) {
      return NextResponse.json({ activities: [] })
    }

    const followedIds = follows.map(f => f.followed_user_id)

    // 2. 팔로우한 유저들의 prediction_activities 조회
    const { data: activities, error: actError } = await supabase
      .from('prediction_activities')
      .select(`
        id, user_id, round_id, sport, prediction_count, created_at
      `)
      .in('user_id', followedIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (actError) {
      console.error('Failed to fetch prediction activities:', actError)
      return NextResponse.json(
        { error: '피드를 불러오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (!activities || activities.length === 0) {
      return NextResponse.json({ activities: [] })
    }

    // 3. 구매 여부 체크
    const activityIds = activities.map(a => a.id)
    const { data: purchases } = await supabase
      .from('prediction_purchases')
      .select('activity_id')
      .eq('buyer_id', user.id)
      .in('activity_id', activityIds)

    const purchasedSet = new Set(purchases?.map(p => p.activity_id) || [])

    // 4. 프로필 조회
    const userIds = [...new Set(activities.map(a => a.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .in('user_id', userIds)

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

    // 5. 유저 스탯 조회 (전체 종목)
    const { data: stats } = await supabase
      .from('betman_user_sport_stats')
      .select('user_id, accuracy, net_profit, current_streak')
      .in('user_id', userIds)
      .eq('sport', '전체')

    const statsMap = new Map(stats?.map(s => [s.user_id, s]) || [])

    // 6. 라운드 정보 조회
    const roundIds = [...new Set(activities.map(a => a.round_id))]
    const { data: rounds } = await supabase
      .from('betman_rounds')
      .select('id, year, round, status')
      .in('id', roundIds)

    const roundMap = new Map(rounds?.map(r => [r.id, r]) || [])

    // 7. 구매한 활동에 대해 예측 데이터 조회
    const purchasedActivities = activities.filter(a => purchasedSet.has(a.id))
    let predictionsMap = new Map<string, any[]>()

    if (purchasedActivities.length > 0) {
      // 구매한 활동의 (user_id, round_id) 조합으로 예측 조회
      for (const act of purchasedActivities) {
        const { data: preds } = await supabase
          .from('betman_predictions')
          .select(`
            id, game_id, prediction, status,
            game:betman_games(home_team_name, away_team_name, match_time, game_type, sport, result)
          `)
          .eq('user_id', act.user_id)
          .eq('round_id', act.round_id)

        if (preds) {
          predictionsMap.set(act.id, preds)
        }
      }
    }

    // 8. 응답 조합
    const result = activities.map(act => {
      const profile = profileMap.get(act.user_id)
      const stat = statsMap.get(act.user_id)
      const round = roundMap.get(act.round_id)
      const isPurchased = purchasedSet.has(act.id)

      return {
        id: act.id,
        user_id: act.user_id,
        round_id: act.round_id,
        sport: act.sport,
        prediction_count: act.prediction_count,
        created_at: act.created_at,
        profile: profile ? {
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
        } : { nickname: '익명', avatar_url: null },
        stats: stat ? {
          accuracy: parseFloat(stat.accuracy) || 0,
          net_profit: parseFloat(stat.net_profit) || 0,
          current_streak: stat.current_streak || 0,
        } : null,
        round: round ? {
          year: round.year,
          round: round.round,
          status: round.status,
        } : null,
        is_purchased: isPurchased,
        predictions: isPurchased ? (predictionsMap.get(act.id) || null) : null,
      }
    })

    return NextResponse.json({ activities: result })
  } catch (error) {
    console.error('Feed predictions API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
