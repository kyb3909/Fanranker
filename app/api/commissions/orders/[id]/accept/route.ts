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
    if (order.artist_id !== user.id) return NextResponse.json({ error: '작가만 수락할 수 있습니다.' }, { status: 403 })
    if (order.status !== 'pending') return NextResponse.json({ error: '대기 중인 주문만 수락할 수 있습니다.' }, { status: 400 })

    const deadline = new Date()
    deadline.setDate(deadline.getDate() + order.delivery_days)

    const { data, error } = await supabase
      .from('commission_orders')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        deadline_at: deadline.toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: '수락 처리 실패' }, { status: 500 })

    // Notify client
    supabase.from('notifications').insert({
      user_id: order.client_id,
      type: 'commission_accepted',
      actor_id: user.id,
    }).then(({ error: e }) => { if (e) console.error('Notification insert failed:', e) })

    supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: '작가가 주문을 수락했습니다. 작업이 시작됩니다.',
    }).then(({ error: e }) => { if (e) console.error('Message insert failed:', e) })

    return NextResponse.json({ order: data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
