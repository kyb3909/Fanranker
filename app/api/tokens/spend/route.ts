import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from '@/lib/api-error'
import { z } from 'zod'

const TokenSpendSchema = z.object({
  amount: z.number().int('토큰 양은 정수여야 합니다.').positive('토큰 양은 0보다 커야 합니다.'),
  description: z.string().optional(),
  related_prediction_id: z.string().optional(),
})

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
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const parsed = TokenSpendSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || '유효하지 않은 토큰 양입니다.')
    }
    const { amount, description, related_prediction_id } = parsed.data

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
      return apiError('토큰 차감 중 오류가 발생했습니다.', 500, rpcError)
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
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
