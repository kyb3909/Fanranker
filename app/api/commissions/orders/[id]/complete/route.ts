import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { EscrowReleaseResult } from '@/lib/supabase/types'

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
    if (order.client_id !== user.id) return NextResponse.json({ error: '의뢰인만 완료 처리할 수 있습니다.' }, { status: 403 })
    if (order.status !== 'review') return NextResponse.json({ error: '검토 중인 주문만 완료할 수 있습니다.' }, { status: 400 })

    // Release escrow (10% fee)
    const { data: result } = await supabase
      .rpc('escrow_release_gold', { p_order_id: id })
      .single() as { data: EscrowReleaseResult | null }

    if (!result?.success) {
      return NextResponse.json({ error: result?.error_message || '정산 처리 실패' }, { status: 500 })
    }

    // used_slots is now managed by DB trigger (trg_sync_commission_used_slots)

    supabase.from('notifications').insert({
      user_id: order.artist_id,
      type: 'commission_completed',
      actor_id: user.id,
    }).then(({ error: e }) => { if (e) console.error('Notification insert failed:', e) })

    supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: `주문이 완료되었습니다. 작가에게 ${result.artist_received}G가 지급됩니다. (수수료 ${result.fee}G)`,
    }).then(({ error: e }) => { if (e) console.error('Message insert failed:', e) })

    return NextResponse.json({
      success: true,
      artist_received: result.artist_received,
      fee: result.fee,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
