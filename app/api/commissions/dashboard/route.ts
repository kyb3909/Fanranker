import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()

    // Verify artist
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_artist')
      .eq('user_id', user.id)
      .single()

    if (!profile?.is_artist) {
      return NextResponse.json({ error: '작가만 대시보드를 볼 수 있습니다.' }, { status: 403 })
    }

    // Get all orders for this artist
    const { data: orders } = await supabase
      .from('commission_orders')
      .select('status, price_gold, platform_fee_gold, created_at, completed_at')
      .eq('artist_id', user.id)

    const stats = {
      total_orders: orders?.length || 0,
      active_orders: orders?.filter(o => ['pending', 'accepted', 'in_progress', 'review', 'revision'].includes(o.status)).length || 0,
      completed_orders: orders?.filter(o => o.status === 'completed').length || 0,
      cancelled_orders: orders?.filter(o => o.status === 'cancelled').length || 0,
      total_earned: orders
        ?.filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + o.price_gold - o.platform_fee_gold, 0) || 0,
      total_fees: orders
        ?.filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + o.platform_fee_gold, 0) || 0,
      completion_rate: 0,
    }

    const decidedOrders = stats.completed_orders + stats.cancelled_orders
    if (decidedOrders > 0) {
      stats.completion_rate = Math.round((stats.completed_orders / decidedOrders) * 100)
    }

    // Get packages
    const { data: packages } = await supabase
      .from('commission_packages')
      .select('id, name, type, is_active, used_slots, max_slots, price_gold')
      .eq('artist_id', user.id)
      .order('sort_order', { ascending: true })

    return NextResponse.json({ stats, packages: packages || [] })
  } catch (error) {
    return apiError('서버 오류', 500, error)
  }
}
