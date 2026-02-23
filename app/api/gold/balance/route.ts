import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

/**
 * GET /api/gold/balance
 *
 * 현재 유저의 골드 잔액 조회
 * 계정이 없으면 자동 생성 (0골드)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    const { data: goldData, error } = await supabase
      .from('user_gold')
      .select('gold_balance, updated_at')
      .eq('user_id', user.id)
      .single()

    if (error && error.code === 'PGRST116') {
      // 레코드 없음 - 자동 생성
      const { data: newGold, error: insertError } = await supabase
        .from('user_gold')
        .insert({ user_id: user.id, gold_balance: 0 })
        .select('gold_balance, updated_at')
        .single()

      if (insertError) {
        return apiError('골드 정보를 생성하는 중 오류가 발생했습니다.', 500, insertError)
      }

      return NextResponse.json({
        balance: newGold.gold_balance,
        updated_at: newGold.updated_at,
      })
    }

    if (error) {
      return apiError('골드 정보를 가져오는 중 오류가 발생했습니다.', 500, error)
    }

    return NextResponse.json({
      balance: goldData.gold_balance,
      updated_at: goldData.updated_at,
    })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
