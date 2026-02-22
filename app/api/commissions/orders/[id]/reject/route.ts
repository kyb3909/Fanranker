import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { EscrowRefundResult } from '@/lib/supabase/types'

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
    if (order.artist_id !== user.id) return NextResponse.json({ error: '작가만 거절할 수 있습니다.' }, { status: 403 })
    if (order.status !== 'pending') return NextResponse.json({ error: '대기 중인 주문만 거절할 수 있습니다.' }, { status: 400 })

    const body = await request.json().catch(() => null) as Record<string, unknown> | null

    // 100% refund
    const { data: refundResult } = await supabase
      .rpc('escrow_refund_gold', { p_order_id: id, p_refund_percent: 100 })
      .single() as { data: EscrowRefundResult | null }

    if (!refundResult?.success) {
      return NextResponse.json({ error: '환불 처리 실패' }, { status: 500 })
    }

    // Update order
    const { error: updateError } = await supabase
      .from('commission_orders')
      .update({
        cancelled_by: user.id,
        cancel_reason: body?.reason || '작가 거절',
      })
      .eq('id', id)

    if (updateError) console.error('Order update failed:', updateError)

    // used_slots is now managed by DB trigger (trg_sync_commission_used_slots)

    // Notify client
    supabase.from('notifications').insert({
      user_id: order.client_id,
      type: 'commission_rejected',
      actor_id: user.id,
    }).then(({ error: e }) => { if (e) console.error('Notification insert failed:', e) })

    supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: `작가가 주문을 거절했습니다. 전액 환불됩니다.${body?.reason ? ` (사유: ${body.reason})` : ''}`,
    }).then(({ error: e }) => { if (e) console.error('Message insert failed:', e) })

    return NextResponse.json({ success: true, refunded: refundResult.refunded })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
