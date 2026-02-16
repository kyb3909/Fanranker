import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// GET /api/commissions/orders/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data: order, error } = await supabase
      .from('commission_orders')
      .select('*, commission_packages(name, type, artist_id)')
      .eq('id', id)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 })
    }

    // Only participants can view
    if (order.client_id !== user.id && order.artist_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    // Fetch milestones
    const { data: milestones } = await supabase
      .from('commission_milestones')
      .select('*')
      .eq('order_id', id)
      .order('milestone_number', { ascending: true })

    // Fetch artist/client profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .in('user_id', [order.client_id, order.artist_id])

    return NextResponse.json({
      order,
      milestones: milestones || [],
      profiles: profiles || [],
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
