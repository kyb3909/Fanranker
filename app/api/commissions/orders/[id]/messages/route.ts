import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// GET /api/commissions/orders/[id]/messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const { id } = await params
    const supabase = createServiceRoleClient()

    // Verify participant
    const { data: order } = await supabase
      .from('commission_orders')
      .select('client_id, artist_id')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
    if (order.client_id !== user.id && order.artist_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const { data: messages, error } = await supabase
      .from('commission_messages')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: '메시지 조회 실패' }, { status: 500 })

    // Mark unread messages as read
    await supabase
      .from('commission_messages')
      .update({ is_read: true })
      .eq('order_id', id)
      .neq('sender_id', user.id)
      .eq('is_read', false)

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

// POST /api/commissions/orders/[id]/messages
export async function POST(
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
      .select('client_id, artist_id, status')
      .eq('id', id)
      .single()

    if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
    if (order.client_id !== user.id && order.artist_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    if (order.status === 'cancelled' || order.status === 'completed') {
      return NextResponse.json({ error: '종료된 주문에는 메시지를 보낼 수 없습니다.' }, { status: 400 })
    }

    const body = await request.json()
    const { content, message_type, attachments } = body

    if (!content?.trim()) return NextResponse.json({ error: '메시지 내용을 입력해주세요.' }, { status: 400 })

    const { data: message, error } = await supabase
      .from('commission_messages')
      .insert({
        order_id: id,
        sender_id: user.id,
        message_type: message_type || 'text',
        content: content.trim(),
        attachments: attachments || [],
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: '메시지 전송 실패' }, { status: 500 })

    // Notify the other party
    const recipientId = user.id === order.client_id ? order.artist_id : order.client_id
    await supabase.from('notifications').insert({
      user_id: recipientId,
      type: 'commission_message',
      actor_id: user.id,
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
