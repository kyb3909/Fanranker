import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/prediction
 * Create a new prediction for a match
 */
export async function POST(request: NextRequest) {
  try {
    // Clerk authentication check
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
    const body = await request.json()
    const { match_id, prediction_type, predicted_value, odds_at_prediction, sport_type, analysis_text, is_premium, price } = body

    // Validation
    if (!match_id || !prediction_type || !predicted_value) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // Check if user is an expert
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_expert')
      .eq('user_id', userId)
      .single()

    const isExpert = profile?.is_expert || false

    // Expert-only validation: analysis_text is required for experts
    if (isExpert) {
      if (!analysis_text || analysis_text.trim().length < 50) {
        return NextResponse.json(
          { error: '전문가는 분석 코멘트를 최소 50자 이상 작성해야 합니다.' },
          { status: 400 }
        )
      }

      // If is_premium is true, price must be set and positive
      if (is_premium && (!price || price <= 0)) {
        return NextResponse.json(
          { error: '유료 콘텐츠로 설정할 경우 가격을 설정해야 합니다.' },
          { status: 400 }
        )
      }
    } else {
      // Non-experts cannot set analysis_text, is_premium, or price
      if (analysis_text || is_premium || price) {
        return NextResponse.json(
          { error: '분석 코멘트와 유료 콘텐츠 설정은 전문가만 사용할 수 있습니다.' },
          { status: 403 }
        )
      }
    }

    // 종목별 조합 제약 검증 (조합 예측인 경우)
    // sport_type 배열이 제공되면 모든 경기의 종목이 동일한지 검증
    if (sport_type && Array.isArray(sport_type)) {
      const uniqueSports = [...new Set(sport_type)]
      if (uniqueSports.length > 1) {
        return NextResponse.json(
          { error: '동일 종목 내에서만 예측 조합이 가능합니다.' },
          { status: 400 }
        )
      }
    }

    // Check if match exists and is open for predictions
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, is_prediction_open, match_time')
      .eq('id', match_id)
      .single()

    if (matchError || !match) {
      return NextResponse.json(
        { error: '경기를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!match.is_prediction_open) {
      return NextResponse.json(
        { error: '이 경기는 예측이 마감되었습니다.' },
        { status: 400 }
      )
    }

    // Check if match time has passed
    const matchTime = new Date(match.match_time)
    const now = new Date()
    
    if (matchTime <= now) {
      return NextResponse.json(
        { error: '경기가 이미 시작되었습니다.' },
        { status: 400 }
      )
    }

    // Check if match is within 24 hours (cyber token prediction rule)
    const hoursUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntilMatch > 24) {
      return NextResponse.json(
        { error: '사이버 토큰은 경기 시작 24시간 이내 경기에만 예측할 수 있습니다.' },
        { status: 400 }
      )
    }

    // Check if user already predicted this match
    const { data: existingPrediction } = await supabase
      .from('predictions')
      .select('id')
      .eq('user_id', userId)
      .eq('match_id', match_id)
      .single()

    if (existingPrediction) {
      return NextResponse.json(
        { error: '이미 이 경기에 예측을 하셨습니다.' },
        { status: 400 }
      )
    }

    // Prepare prediction data
    const predictionData: {
      user_id: string
      match_id: string
      prediction_type: string
      predicted_value: string
      odds_at_prediction: number | null
      analysis_text?: string
      is_premium?: boolean
      price?: number
    } = {
      user_id: userId,
      match_id,
      prediction_type,
      predicted_value,
      odds_at_prediction: odds_at_prediction || null,
    }

    // Add expert-only fields if user is expert
    if (isExpert) {
      predictionData.analysis_text = analysis_text?.trim() || null
      predictionData.is_premium = is_premium || false
      predictionData.price = is_premium ? price : null
    }

    // Create prediction
    const { data: prediction, error: predictionError } = await supabase
      .from('predictions')
      .insert(predictionData)
      .select()
      .single()

    if (predictionError) {
      console.error('Prediction creation error:', predictionError)
      return NextResponse.json(
        { error: '예측 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Update match prediction count
    await supabase.rpc('increment_prediction_count', { match_id_param: match_id })

    // If expert, create notifications for followers (비동기로 처리, 실패해도 무시)
    if (isExpert && prediction) {
      Promise.resolve(supabase
        .from('user_follows')
        .select('follower_id')
        .eq('followed_user_id', userId))
        .then(({ data: followers }) => {
          if (!followers || followers.length === 0) return

          const notifications = followers.map((follow) => ({
            user_id: follow.follower_id,
            type: 'expert_prediction',
            actor_id: userId,
            related_post_id: null, // 예측은 post가 아니므로 null
            related_comment_id: null,
            is_read: false,
          }))

          return supabase.from('notifications').insert(notifications)
        })
        .then(() => {
          console.log(`Expert prediction notifications created for followers of user ${userId}`)
        })
        .catch((err: unknown) => {
          console.error('Failed to create expert prediction notifications:', err)
        })
    }

    // Initialize or update user stats
    const { data: existingStats } = await supabase
      .from('user_prediction_stats')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!existingStats) {
      // Create initial stats for user
      await supabase
        .from('user_prediction_stats')
        .insert({
          user_id: userId,
          total_predictions: 1,
          correct_predictions: 0,
          accuracy: 0,
          total_points: 0,
          current_streak: 0,
          longest_streak: 0,
          level: 1,
          badges: [],
        })
    } else {
      // Increment total predictions
      await supabase
        .from('user_prediction_stats')
        .update({
          total_predictions: supabase.rpc('increment', { row_id: existingStats.id }),
        })
        .eq('user_id', userId)
    }

    return NextResponse.json(prediction, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/prediction
 * Get user's predictions
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
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'pending', 'completed', 'all'

    let query = supabase
      .from('predictions')
      .select(`
        id,
        match_id,
        prediction_type,
        predicted_value,
        odds_at_prediction,
        points_earned,
        is_correct,
        analysis_text,
        is_premium,
        price,
        created_at,
        matches(
          id,
          match_time,
          score_home,
          score_away,
          time_status,
          home_team:teams!matches_home_team_id_fkey(name, name_ko),
          away_team:teams!matches_away_team_id_fkey(name, name_ko),
          league:leagues!matches_league_id_fkey(name, name_ko)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (status === 'pending') {
      query = query.is('is_correct', null)
    } else if (status === 'completed') {
      query = query.not('is_correct', 'is', null)
    }

    const { data: predictions, error } = await query

    if (error) {
      console.error('Failed to fetch predictions:', error)
      return NextResponse.json(
        { error: '예측 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json(predictions)
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
