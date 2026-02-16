import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/betman/prediction
 *
 * Create predictions for Betman games
 *
 * Body:
 * - predictions: Array of { game_id: uuid, prediction: "home" | "draw" | "away" | "over" | "under" }
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json()
    const { predictions } = body

    if (!predictions || !Array.isArray(predictions) || predictions.length === 0) {
      return NextResponse.json(
        { error: '예측 데이터가 필요합니다.' },
        { status: 400 }
      )
    }

    // Validate prediction format
    const validPredictions = ['home', 'draw', 'away', 'over', 'under']
    for (const pred of predictions) {
      if (!pred.game_id || !pred.prediction) {
        return NextResponse.json(
          { error: '잘못된 예측 형식입니다.' },
          { status: 400 }
        )
      }
      if (!validPredictions.includes(pred.prediction)) {
        return NextResponse.json(
          { error: `잘못된 예측 값입니다: ${pred.prediction}` },
          { status: 400 }
        )
      }
    }

    // Get all game details for validation
    const gameIds = predictions.map(p => p.game_id)
    const { data: games, error: gamesError } = await supabase
      .from('betman_games')
      .select('*')
      .in('id', gameIds)

    if (gamesError || !games) {
      console.error('Failed to fetch games:', gamesError)
      return NextResponse.json(
        { error: '경기 정보를 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (games.length !== predictions.length) {
      return NextResponse.json(
        { error: '일부 경기를 찾을 수 없습니다.' },
        { status: 400 }
      )
    }

    // Check all games are from the same round
    const roundIds = [...new Set(games.map(g => g.round_id))]
    if (roundIds.length > 1) {
      return NextResponse.json(
        { error: '모든 경기는 같은 회차여야 합니다.' },
        { status: 400 }
      )
    }

    // Check round is still open
    const { data: round, error: roundError } = await supabase
      .from('betman_rounds')
      .select('*')
      .eq('id', roundIds[0])
      .single()

    if (roundError || !round) {
      return NextResponse.json(
        { error: '회차 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (round.status !== 'open') {
      return NextResponse.json(
        { error: '이 회차는 마감되었습니다.' },
        { status: 400 }
      )
    }

    // Check deadline
    if (new Date(round.deadline) < new Date()) {
      return NextResponse.json(
        { error: '예측 마감 시간이 지났습니다.' },
        { status: 400 }
      )
    }

    // Validate single sport restriction
    const sports = [...new Set(games.map(g => g.sport))]
    if (sports.length > 1) {
      return NextResponse.json(
        { error: '한 종목의 경기만 선택할 수 있습니다.' },
        { status: 400 }
      )
    }

    // Validate no duplicate physical matches
    // Physical match = same home_team + away_team + match_time
    const matchKeys = games.map(g => `${g.home_team_name}_${g.away_team_name}_${g.match_time}`)
    const uniqueMatchKeys = [...new Set(matchKeys)]
    if (uniqueMatchKeys.length !== matchKeys.length) {
      return NextResponse.json(
        { error: '같은 경기에 대해 중복 선택할 수 없습니다.' },
        { status: 400 }
      )
    }

    // Check for games that have already started
    const now = new Date()
    const startedGames = games.filter(g => new Date(g.match_time) <= now)
    if (startedGames.length > 0) {
      return NextResponse.json(
        { error: '이미 시작된 경기가 포함되어 있습니다.' },
        { status: 400 }
      )
    }

    // Validate prediction type matches game type
    for (const pred of predictions) {
      const game = games.find(g => g.id === pred.game_id)
      if (!game) continue

      const isOverUnder = game.game_type.includes('언더오버')
      const isOverUnderPrediction = ['over', 'under'].includes(pred.prediction)

      if (isOverUnder && !isOverUnderPrediction) {
        return NextResponse.json(
          { error: '언더오버 경기에는 over 또는 under만 선택할 수 있습니다.' },
          { status: 400 }
        )
      }

      if (!isOverUnder && isOverUnderPrediction) {
        return NextResponse.json(
          { error: '일반/핸디캡 경기에는 home, draw, away만 선택할 수 있습니다.' },
          { status: 400 }
        )
      }

      // Draw is not valid for 농구 (basketball)
      if (game.sport === '농구' && pred.prediction === 'draw' && !isOverUnder) {
        return NextResponse.json(
          { error: '농구 경기에서는 무승부를 선택할 수 없습니다.' },
          { status: 400 }
        )
      }
    }

    // ===== 볼(토큰) 잔액 확인 및 차감 =====
    const ballCost = predictions.length // 예측 1개당 1볼

    // Check for existing predictions (to avoid double charging)
    const { data: existingPredictions } = await supabase
      .from('betman_predictions')
      .select('id')
      .eq('user_id', user.id)
      .eq('round_id', roundIds[0])

    const isModifying = existingPredictions && existingPredictions.length > 0

    // If modifying, calculate the difference in balls needed
    const previousCount = existingPredictions?.length || 0
    const actualBallCost = isModifying
      ? Math.max(0, ballCost - previousCount) // Only charge for additional predictions
      : ballCost

    // Atomic token deduction via RPC (prevents race conditions)
    let newBalance: number | undefined
    if (actualBallCost > 0) {
      const { data: spendResult, error: rpcError } = await supabase
        .rpc('spend_tokens', {
          p_user_id: user.id,
          p_amount: actualBallCost,
          p_description: `베트맨 예측 ${predictions.length}경기 (${round.year}년 ${round.round}회차)${isModifying ? ' - 수정' : ''}`,
        })
        .single() as { data: { success: boolean; new_balance: number; error_message: string | null } | null; error: any }

      if (rpcError || !spendResult) {
        console.error('Failed to deduct balls:', rpcError)
        return NextResponse.json(
          { error: '볼 차감 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }

      if (!spendResult.success) {
        return NextResponse.json(
          { error: '볼이 부족합니다.' },
          { status: 400 }
        )
      }

      newBalance = spendResult.new_balance
    }

    // Delete existing predictions for this user and round
    if (isModifying) {
      const { error: deleteError } = await supabase
        .from('betman_predictions')
        .delete()
        .eq('user_id', user.id)
        .eq('round_id', roundIds[0])
      if (deleteError) {
        console.error('Failed to delete existing predictions:', deleteError)
        // Refund if we charged (원자적 RPC)
        if (actualBallCost > 0) {
          await supabase.rpc('refund_tokens', {
            p_user_id: user.id,
            p_amount: actualBallCost,
            p_description: '예측 삭제 실패 환불',
          })
        }
        return NextResponse.json(
          { error: '기존 예측 삭제 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
    }

    // Insert new predictions
    const predictionRecords = predictions.map(pred => ({
      user_id: user.id,
      round_id: roundIds[0],
      game_id: pred.game_id,
      prediction: pred.prediction,
      created_at: new Date().toISOString()
    }))

    const { data: insertedPredictions, error: insertError } = await supabase
      .from('betman_predictions')
      .insert(predictionRecords)
      .select()

    if (insertError) {
      console.error('Failed to insert predictions:', insertError)
      // Refund if we charged (원자적 RPC)
      if (actualBallCost > 0) {
        await supabase.rpc('refund_tokens', {
          p_user_id: user.id,
          p_amount: actualBallCost,
          p_description: '예측 저장 실패 환불',
        })
      }
      return NextResponse.json(
        { error: '예측 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // If no cost, get current balance for response
    if (newBalance === undefined) {
      const { data: tokenData } = await supabase
        .from('user_tokens')
        .select('token_balance')
        .eq('user_id', user.id)
        .single()
      newBalance = tokenData?.token_balance ?? 0
    }

    // ===== 예측 활동 피드 생성 (upsert) =====
    try {
      await supabase.from('prediction_activities').upsert({
        user_id: user.id,
        round_id: roundIds[0],
        sport: sports[0],
        prediction_count: predictions.length,
      }, { onConflict: 'user_id,round_id,sport' })
    } catch (e) {
      console.error('Failed to upsert prediction activity:', e)
    }

    // ===== 팔로워에게 알림 전송 =====
    try {
      const { data: followers } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('followed_user_id', user.id)

      if (followers && followers.length > 0 && !isModifying) {
        const notifications = followers.map(f => ({
          user_id: f.follower_id,
          type: 'expert_prediction',
          actor_id: user.id,
        }))
        await supabase.from('notifications').insert(notifications)
      }
    } catch (e) {
      console.error('Failed to send follower notifications:', e)
    }

    return NextResponse.json({
      success: true,
      predictions: insertedPredictions,
      ballsUsed: actualBallCost,
      remainingBalls: newBalance,
      message: actualBallCost > 0
        ? `${predictions.length}개의 예측이 저장되었습니다. (${actualBallCost}볼 사용, 잔액: ${newBalance}볼)`
        : `${predictions.length}개의 예측이 수정되었습니다. (추가 볼 사용 없음)`
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/betman/prediction
 *
 * Get user's predictions for a round
 *
 * Query Parameters:
 * - round_id?: uuid (specific round, defaults to current open round)
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
    const roundId = searchParams.get('round_id')

    // Get target round
    let targetRoundId = roundId
    if (!targetRoundId) {
      const { data: openRound } = await supabase
        .from('betman_rounds')
        .select('id')
        .eq('status', 'open')
        .order('year', { ascending: false })
        .order('round', { ascending: false })
        .limit(1)
        .single()

      if (!openRound) {
        return NextResponse.json({
          predictions: [],
          message: '현재 진행중인 회차가 없습니다.'
        })
      }
      targetRoundId = openRound.id
    }

    // Get user's predictions with game details
    const { data: predictions, error: predError } = await supabase
      .from('betman_predictions')
      .select(`
        *,
        game:betman_games(*)
      `)
      .eq('user_id', user.id)
      .eq('round_id', targetRoundId)

    if (predError) {
      console.error('Failed to fetch predictions:', predError)
      return NextResponse.json(
        { error: '예측 정보를 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      predictions: predictions || [],
      round_id: targetRoundId
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
