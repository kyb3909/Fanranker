import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api-error'

/**
 * GET /api/admin/tokens/balances
 *
 * Get token balances for all users (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const supabase = createServiceRoleClient()

    const { data: tokens, error } = await supabase
      .from('user_tokens')
      .select(`
        user_id,
        token_balance,
        last_reset_at,
        total_tokens_earned,
        profiles (
          nickname,
          avatar_url
        )
      `)
      .order('token_balance', { ascending: false })

    if (error) {
      return apiError('토큰 목록을 가져오는 중 오류가 발생했습니다.', 500, error)
    }

    return NextResponse.json({ tokens: tokens || [] })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
