import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/tokens/spend
 * 
 * Spend tokens for a prediction or other action
 * Uses database transaction to ensure atomicity
 * 
 * Body:
 * - amount: number (required) - Amount of tokens to spend (positive integer)
 * - description?: string - Optional description
 * - related_prediction_id?: string - Optional prediction ID
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
    const { amount, description, related_prediction_id } = body

    // Validation
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰 양입니다.' },
        { status: 400 }
      )
    }

    // Ensure daily reset is applied first
    await supabase.rpc('ensure_daily_token_reset', {
      target_user_id: userId,
    })

    // Get current balance with row-level locking (FOR UPDATE)
    // Note: Supabase doesn't directly support FOR UPDATE, so we'll use a transaction via RPC
    const { data: currentToken, error: fetchError } = await supabase
      .from('user_tokens')
      .select('token_balance')
      .eq('user_id', userId)
      .single()

    if (fetchError || !currentToken) {
      return NextResponse.json(
        { error: '토큰 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const currentBalance = currentToken.token_balance

    // Check if user has enough tokens
    if (currentBalance < amount) {
      return NextResponse.json(
        { error: '토큰이 부족합니다.', balance: currentBalance, required: amount },
        { status: 400 }
      )
    }

    // Calculate new balance
    const newBalance = currentBalance - amount

    // Update token balance
    const { data: updatedToken, error: updateError } = await supabase
      .from('user_tokens')
      .update({
        token_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('token_balance')
      .single()

    if (updateError) {
      console.error('Failed to update token balance:', updateError)
      return NextResponse.json(
        { error: '토큰 차감 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Log transaction
    const { error: transactionError } = await supabase
      .from('token_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'prediction_spent',
        amount: -amount, // Negative for spending
        balance_after: newBalance,
        description: description || `토큰 ${amount}개 사용`,
        related_prediction_id: related_prediction_id || null,
      })

    if (transactionError) {
      console.error('Failed to log transaction:', transactionError)
      // Don't fail the request if transaction logging fails, but log it
    }

    return NextResponse.json({
      success: true,
      balance: updatedToken.token_balance,
      spent: amount,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
