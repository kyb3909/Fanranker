import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

const VALID_REASONS = ['discrimination', 'advertising', 'profanity', 'abuse', 'political'] as const

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const body = await request.json()
    const { targetType, targetId, reason, description } = body

    // 유효성 검증
    if (!targetType || !targetId || !reason) {
      return NextResponse.json({ error: 'targetType, targetId, reason은 필수입니다.' }, { status: 400 })
    }

    if (!['post', 'comment'].includes(targetType)) {
      return NextResponse.json({ error: '잘못된 targetType입니다.' }, { status: 400 })
    }

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json({ error: '잘못된 신고 사유입니다.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // 중복 신고 방지: 같은 reporter + target 조합 체크
    const { data: existing } = await supabase
      .from('content_reports')
      .select('id')
      .eq('reporter_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: '이미 신고한 콘텐츠입니다.' }, { status: 409 })
    }

    // 신고 INSERT
    const { error } = await supabase.from('content_reports').insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      description: description || null,
      status: 'pending',
    })

    if (error) {
      return apiError('신고 접수에 실패했습니다.', 500, error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
