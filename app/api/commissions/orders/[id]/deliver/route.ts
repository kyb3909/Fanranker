import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

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

    await supabase
      .from('commission_orders')
      .update({
        status: 'review',
        submitted_at: new Date().toISOString(),
        auto_release_at: autoRelease.toISOString(),
      })
      .eq('id', id)

    await supabase.from('notifications').insert({
      user_id: order.client_id,
      type: 'commission_milestone_submitted',
      actor_id: user.id,
    })

    await supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: '작가가 최종 결과물을 제출했습니다. 확인 후 완료 처리해주세요. (3일 후 자동 정산)',
    })

    return NextResponse.json({ success: true, auto_release_at: autoRelease.toISOString() })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
