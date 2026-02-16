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
    if (order.client_id !== user.id) return NextResponse.json({ error: '의뢰인만 완료 처리할 수 있습니다.' }, { status: 403 })
    if (order.status !== 'review') return NextResponse.json({ error: '검토 중인 주문만 완료할 수 있습니다.' }, { status: 400 })

    // Release escrow (10% fee)
    const { data: result } = await supabase
      .rpc('escrow_release_gold', { p_order_id: id })
      .single()

    if (!result?.success) {
      return NextResponse.json({ error: result?.error_message || '정산 처리 실패' }, { status: 500 })
    }

    // Decrement used_slots
    const { data: pkg } = await supabase
      .from('commission_packages')
      .select('used_slots')
      .eq('id', order.package_id)
      .single()

    if (pkg && pkg.used_slots > 0) {
      await supabase
        .from('commission_packages')
        .update({ used_slots: pkg.used_slots - 1 })
        .eq('id', order.package_id)
    }

    await supabase.from('notifications').insert({
      user_id: order.artist_id,
      type: 'commission_completed',
      actor_id: user.id,
    })

    await supabase.from('commission_messages').insert({
      order_id: id,
      sender_id: 'system',
      message_type: 'system',
      content: `주문이 완료되었습니다. 작가에게 ${result.artist_received}G가 지급됩니다. (수수료 ${result.fee}G)`,
    })

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
