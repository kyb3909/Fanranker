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

    // Atomic token deduction via RPC (prevents race conditions)
    const { data: result, error: rpcError } = await supabase
      .rpc('spend_tokens', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description || null,
        p_related_prediction_id: related_prediction_id || null,
      })
      .single() as { data: { success: boolean; new_balance: number; error_message: string | null } | null; error: unknown }

    if (rpcError || !result) {
      console.error('Failed to spend tokens:', rpcError)
      return NextResponse.json(
        { error: '토큰 차감 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error_message, balance: result.new_balance, required: amount },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      balance: result.new_balance,
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
