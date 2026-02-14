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

    // 사용자의 현재 볼 잔액 조회
    const { data: userTokens, error: tokensError } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (tokensError && tokensError.code !== 'PGRST116') {
      console.error('Failed to fetch user tokens:', tokensError)
      return NextResponse.json(
        { error: '볼 잔액 조회 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // 토큰 레코드가 없으면 생성 (기본 10볼)
    let currentBalance = 10
    if (!userTokens) {
      const { error: createError } = await supabase
        .from('user_tokens')
        .insert({
          user_id: user.id,
          token_balance: 10,
          last_reset_at: new Date().toISOString()
        })
      if (createError) {
        console.error('Failed to create user tokens:', createError)
        return NextResponse.json(
          { error: '볼 계정 생성 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
    } else {
      currentBalance = userTokens.token_balance
    }

    // 잔액 부족 체크
    if (currentBalance < ballCost) {
      return NextResponse.json(
        { error: `볼이 부족합니다. 현재 잔액: ${currentBalance}볼, 필요: ${ballCost}볼` },
        { status: 400 }
      )
    }

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

    // Re-check balance if we need to charge more
    if (actualBallCost > 0 && currentBalance < actualBallCost) {
      return NextResponse.json(
        { error: `볼이 부족합니다. 현재 잔액: ${currentBalance}볼, 추가 필요: ${actualBallCost}볼` },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: '예측 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // ===== 볼 차감 (추가 비용이 있을 때만) =====
    let newBalance = currentBalance
    if (actualBallCost > 0) {
      newBalance = currentBalance - actualBallCost
      const { error: updateError } = await supabase
        .from('user_tokens')
        .update({
          token_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Failed to deduct balls:', updateError)
        // 예측은 저장됐지만 볼 차감 실패 - 로그만 남기고 진행
      }

      // 트랜잭션 기록
      const { error: txError } = await supabase
        .from('token_transactions')
        .insert({
          user_id: user.id,
          transaction_type: 'prediction_spent',
          amount: -actualBallCost,
          balance_after: newBalance,
          description: `베트맨 예측 ${predictions.length}경기 (${round.year}년 ${round.round}회차)${isModifying ? ' - 수정' : ''}`
        })
      if (txError) {
        console.error('Failed to log prediction transaction:', txError)
      }
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
