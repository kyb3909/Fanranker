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

    const isClient = order.client_id === user.id
    const isArtist = order.artist_id === user.id
    if (!isClient && !isArtist) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    // Cannot cancel in review/revision/completed states
    if (['review', 'revision', 'completed', 'cancelled'].includes(order.status)) {
      return NextResponse.json({ error: '현재 상태에서는 취소할 수 없습니다.' }, { status: 400 })
    }

    // Determine refund percentage
    let refundPercent = 100
    if (order.status === 'in_progress') {
      if (isArtist) {
        refundPercent = 100 // Artist cancels → full refund
      } else {
        refundPercent = 50 // Client cancels during work → 50% refund
      }
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null

    const { data: refundResult } = await supabase
      .rpc('escrow_refund_gold', { p_order_id: id, p_refund_percent: refundPercent })
      .single() as { data: EscrowRefundResult | null }

    if (!refundResult?.success) {
      return NextResponse.json({ error: '환불 처리 실패' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('commission_orders')
      .update({
        cancelled_by: user.id,
        cancel_reason: body?.reason || '',
      })
      .eq('id', id)

    if (updateError) console.error('Order update failed:', updateError)

    // used_slots is now managed by DB trigger (trg_sync_commission_used_slots)

    // Notify other party
    const notifyUserId = isClient ? order.artist_id : order.client_id
    supabase.from('notifications').insert({
      user_id: notifyUserId,
      type: 'commission_cancelled',
      actor_id: user.id,
    }).then(({ error: e }) => { if (e) console.error('Notification insert failed:', e) })

    supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: `주문이 취소되었습니다. (환불 ${refundPercent}%)${body?.reason ? ` 사유: ${body.reason}` : ''}`,
    }).then(({ error: e }) => { if (e) console.error('Message insert failed:', e) })

    return NextResponse.json({
      success: true,
      refund_percent: refundPercent,
      refunded: refundResult.refunded,
      artist_received: refundResult.artist_received,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
