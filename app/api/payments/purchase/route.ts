import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/payments/purchase
 * 
 * Purchase a premium prediction content (one-time purchase)
 * 
 * Body:
 * - prediction_id: string (required) - Prediction ID to purchase
 * 
 * Note: This uses token-based system. For production, integrate with Stripe or other payment gateway.
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

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const { prediction_id } = body

    if (!prediction_id) {
      return NextResponse.json(
        { error: '예측 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // Check if prediction exists and is premium
    const { data: prediction, error: predError } = await supabase
      .from('predictions')
      .select('id, user_id, is_premium, price, analysis_text')
      .eq('id', prediction_id)
      .single()

    if (predError || !prediction) {
      return NextResponse.json(
        { error: '예측을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!prediction.is_premium) {
      return NextResponse.json(
        { error: '이 예측은 유료 콘텐츠가 아닙니다.' },
        { status: 400 }
      )
    }

    if (!prediction.price || prediction.price <= 0) {
      return NextResponse.json(
        { error: '유효하지 않은 가격입니다.' },
        { status: 400 }
      )
    }

    // Check if user already purchased this content
    const { data: existingPurchase } = await supabase
      .from('purchased_content')
      .select('id')
      .eq('user_id', userId)
      .eq('prediction_id', prediction_id)
      .single()

    if (existingPurchase) {
      return NextResponse.json(
        { error: '이미 구매한 콘텐츠입니다.', already_purchased: true },
        { status: 400 }
      )
    }

    // Check if user has an active subscription to the expert
    const { data: subscription } = await supabase
      .rpc('is_subscription_active', {
        p_subscriber_id: userId,
        p_expert_id: prediction.user_id,
      })

    if (subscription) {
      // User has active subscription, grant access without payment
      const { data: purchase, error: purchaseError } = await supabase
        .from('purchased_content')
        .insert({
          user_id: userId,
          prediction_id: prediction_id,
          purchase_price: 0, // Free due to subscription
        })
        .select()
        .single()

      if (purchaseError) {
        console.error('Failed to record subscription-based purchase:', purchaseError)
        return NextResponse.json(
          { error: '구매 기록 생성 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: '구독으로 인해 무료로 열람 가능합니다.',
        purchase,
        via_subscription: true,
      })
    }

    // Check token balance and deduct using tokens/spend API pattern
    // Ensure daily reset is applied first
    await supabase.rpc('ensure_daily_token_reset', { target_user_id: userId })

    // Get current balance
    const { data: currentToken } = await supabase
      .from('user_tokens')
      .select('token_balance')
      .eq('user_id', userId)
      .single()

    const currentBalance = currentToken?.token_balance || 0

    if (currentBalance < prediction.price) {
      return NextResponse.json(
        { error: `토큰이 부족합니다. (보유: ${currentBalance}, 필요: ${prediction.price})` },
        { status: 400 }
      )
    }

    // Deduct tokens
    const newBalance = currentBalance - prediction.price
    const { error: updateError } = await supabase
      .from('user_tokens')
      .update({
        token_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Failed to spend tokens:', updateError)
      return NextResponse.json(
        { error: '토큰 차감 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Log transaction
    const { error: txError } = await supabase
      .from('token_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'prediction_spent',
        amount: -prediction.price,
        balance_after: newBalance,
        description: `Premium prediction purchase: ${prediction_id}`,
        related_prediction_id: prediction_id,
      })
    if (txError) {
      console.error('Failed to log purchase transaction:', txError)
    }

    // Record purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchased_content')
      .insert({
        user_id: userId,
        prediction_id: prediction_id,
        purchase_price: prediction.price,
      })
      .select()
      .single()

    if (purchaseError) {
      console.error('Failed to record purchase:', purchaseError)
      // Refund: 구매 기록 실패 시 토큰 환불
      await supabase
        .from('user_tokens')
        .update({
          token_balance: currentBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      return NextResponse.json(
        { error: '구매 기록 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '구매가 완료되었습니다.',
      purchase,
      new_balance: newBalance,
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
 * GET /api/payments/purchase
 * 
 * Check if user has purchased specific content
 * 
 * Query Parameters:
 * - prediction_id: string (required) - Prediction ID to check
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ purchased: false })
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get('prediction_id')

    if (!predictionId) {
      return NextResponse.json(
        { error: '예측 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // Check direct purchase
    const { data: purchase } = await supabase
      .from('purchased_content')
      .select('id')
      .eq('user_id', userId)
      .eq('prediction_id', predictionId)
      .single()

    if (purchase) {
      return NextResponse.json({ purchased: true, via_subscription: false })
    }

    // Check subscription access
    const { data: prediction } = await supabase
      .from('predictions')
      .select('user_id')
      .eq('id', predictionId)
      .single()

    if (prediction) {
      const { data: hasSubscription } = await supabase
        .rpc('is_subscription_active', {
          p_subscriber_id: userId,
          p_expert_id: prediction.user_id,
        })

      if (hasSubscription) {
        return NextResponse.json({ purchased: true, via_subscription: true })
      }
    }

    return NextResponse.json({ purchased: false })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ purchased: false })
  }
}
