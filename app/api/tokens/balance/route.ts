import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

/**
 * GET /api/tokens/balance
 * 
 * Get current user's token balance
 * Automatically resets tokens if last_reset_at < today (missed reset handling)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    // Use the PostgreSQL function to ensure daily reset is applied
    const { data: balance, error: rpcError } = await supabase.rpc('ensure_daily_token_reset', {
      target_user_id: userId,
    })

    if (rpcError) {
      console.error('Failed to ensure token reset:', rpcError)
      // Fallback: try direct query
      const { data: tokenData, error: fetchError } = await supabase
        .from('user_tokens')
        .select('token_balance, last_reset_at, total_tokens_earned')
        .eq('user_id', userId)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows found - create initial record
        const { data: newToken, error: insertError } = await supabase
          .from('user_tokens')
          .insert({
            user_id: userId,
            token_balance: 10,
            last_reset_at: new Date().toISOString(),
            total_tokens_earned: 10,
          })
          .select('token_balance, last_reset_at, total_tokens_earned')
          .single()

        if (insertError) {
          return apiError('토큰 정보를 가져오는 중 오류가 발생했습니다.', 500, insertError)
        }

        return NextResponse.json({
          balance: newToken.token_balance,
          lastResetAt: newToken.last_reset_at,
          totalEarned: newToken.total_tokens_earned,
        })
      }

      if (!tokenData) {
        return NextResponse.json(
          { error: '토큰 정보를 찾을 수 없습니다.' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        balance: tokenData.token_balance,
        lastResetAt: tokenData.last_reset_at,
        totalEarned: tokenData.total_tokens_earned,
      })
    }

    // If RPC succeeded, get full token data
    const { data: tokenData, error: fetchError } = await supabase
      .from('user_tokens')
      .select('token_balance, last_reset_at, total_tokens_earned')
      .eq('user_id', userId)
      .single()

    if (fetchError) {
      return apiError('토큰 정보를 가져오는 중 오류가 발생했습니다.', 500, fetchError)
    }

    return NextResponse.json({
      balance: tokenData.token_balance,
      lastResetAt: tokenData.last_reset_at,
      totalEarned: tokenData.total_tokens_earned,
    })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
