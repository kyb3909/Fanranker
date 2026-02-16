import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { updateUserSportStats } from '@/lib/betman/stats'
import { verifyCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/betman/stats/recalculate
 *
 * 전체 유저의 betman_user_sport_stats를 처음부터 재계산한다.
 * 데이터 정합성 보정용 (관리자 전용).
 *
 * 처리 흐름:
 *   1. betman_predictions에서 settled/cancelled인 모든 고유 user_id 조회
 *   2. 각 유저에 대해 updateUserSportStats 실행
 *   3. 결과 반환
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    // 정산된 예측이 있는 모든 유저 조회
    const { data: userRows, error: userError } = await supabase
      .from('betman_predictions')
      .select('user_id')
      .in('status', ['settled', 'cancelled'])

    if (userError) {
      return NextResponse.json(
        { error: '유저 조회 실패' },
        { status: 500 }
      )
    }

    const userIds = [...new Set((userRows || []).map(r => r.user_id))]

    if (userIds.length === 0) {
      return NextResponse.json({
        message: '재계산할 유저가 없습니다.',
        updated: 0,
      })
    }

    // 각 유저별 통계 재계산
    let updated = 0
    const errors: string[] = []

    for (const userId of userIds) {
      try {
        await updateUserSportStats(supabase, userId)
        updated++
      } catch (e) {
        errors.push(`user=${userId}: ${(e as Error).message}`)
      }
    }

    return NextResponse.json({
      message: `${updated}명의 통계를 재계산했습니다.`,
      updated,
      totalUsers: userIds.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e) {
    console.error('Stats recalculate error:', e)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
