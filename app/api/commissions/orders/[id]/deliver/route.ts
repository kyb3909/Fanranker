import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data: order } = await supabase
      .from('commission_orders')
      .select('*')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
    if (order.artist_id !== user.id) return NextResponse.json({ error: '작가만 최종 제출할 수 있습니다.' }, { status: 403 })
    if (!['in_progress', 'revision'].includes(order.status)) {
      return NextResponse.json({ error: '현재 상태에서는 최종 제출할 수 없습니다.' }, { status: 400 })
    }

    const autoRelease = new Date()
    autoRelease.setDate(autoRelease.getDate() + 3)

    const { error: updateError } = await supabase
      .from('commission_orders')
      .update({
        status: 'review',
        submitted_at: new Date().toISOString(),
        auto_release_at: autoRelease.toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: '상태 업데이트 실패' }, { status: 500 })
    }

    supabase.from('notifications').insert({
      user_id: order.client_id,
      type: 'commission_milestone_submitted',
      actor_id: user.id,
    }).then(({ error: e }) => { if (e) console.error('Notification insert failed:', e) })

    supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: '작가가 최종 결과물을 제출했습니다. 확인 후 완료 처리해주세요. (3일 후 자동 정산)',
    }).then(({ error: e }) => { if (e) console.error('Message insert failed:', e) })

    return NextResponse.json({ success: true, auto_release_at: autoRelease.toISOString() })
  } catch (error) {
    return apiError('서버 오류', 500, error)
  }
}
