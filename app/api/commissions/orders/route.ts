import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const MILESTONE_PRESETS: Record<string, string[]> = {
  'illustration': ['스케치', '선화', '채색', '최종'],
  'character-design': ['콘셉트 러프', '디자인 시안', '컬러링', '최종'],
  'portrait': ['구도 스케치', '디테일 작업', '최종'],
  'logo': ['콘셉트 시안', '디테일 작업', '최종'],
  'comic-page': ['스토리보드', '펜선', '채색', '최종'],
  'animation': ['키프레임', '중간 동작', '컬러링', '최종'],
  'concept-art': ['러프 스케치', '디테일 작업', '최종'],
  'custom': ['초안', '수정', '최종'],
}

// GET /api/commissions/orders
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role') // 'client' | 'artist' | null (both)
    const status = searchParams.get('status')

    const supabase = createServiceRoleClient()
    let query = supabase
      .from('commission_orders')
      .select('*, commission_packages(name, type)')
      .order('created_at', { ascending: false })

    if (role === 'client') {
      query = query.eq('client_id', user.id)
    } else if (role === 'artist') {
      query = query.eq('artist_id', user.id)
    } else {
      query = query.or(`client_id.eq.${user.id},artist_id.eq.${user.id}`)
    }

    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch orders:', error)
      return NextResponse.json({ error: '주문 조회 실패' }, { status: 500 })
    }

    return NextResponse.json({ orders: data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

// POST /api/commissions/orders
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const supabase = createServiceRoleClient()
    const body = await request.json()
    const { package_id, title, description, reference_images } = body

    if (!package_id || !title) {
      return NextResponse.json({ error: '패키지와 제목은 필수입니다.' }, { status: 400 })
    }

    // Fetch package
    const { data: pkg } = await supabase
      .from('commission_packages')
      .select('*')
      .eq('id', package_id)
      .single()

    if (!pkg) return NextResponse.json({ error: '패키지를 찾을 수 없습니다.' }, { status: 404 })
    if (!pkg.is_active) return NextResponse.json({ error: '비활성 패키지입니다.' }, { status: 400 })
    if (pkg.used_slots >= pkg.max_slots) return NextResponse.json({ error: '슬롯이 가득 찼습니다.' }, { status: 400 })
    if (pkg.artist_id === user.id) return NextResponse.json({ error: '자신에게 주문할 수 없습니다.' }, { status: 400 })

    // Check gold balance
    const { data: goldData } = await supabase
      .from('user_gold')
      .select('gold_balance')
      .eq('user_id', user.id)
      .single()

    if (!goldData || goldData.gold_balance < pkg.price_gold) {
      return NextResponse.json({
        error: '골드가 부족합니다.',
        balance: goldData?.gold_balance || 0,
        required: pkg.price_gold,
      }, { status: 400 })
    }

    // Generate order number
    const { data: orderNumber } = await supabase.rpc('generate_order_number')

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('commission_orders')
      .insert({
        order_number: orderNumber,
        package_id,
        client_id: user.id,
        artist_id: pkg.artist_id,
        title,
        description: description || '',
        reference_images: reference_images || [],
        price_gold: pkg.price_gold,
        delivery_days: pkg.delivery_days,
        max_revisions: pkg.max_revisions,
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('Failed to create order:', orderError)
      return NextResponse.json({ error: '주문 생성 실패' }, { status: 500 })
    }

    // Create milestones based on package type
    const milestoneNames = MILESTONE_PRESETS[pkg.type] || MILESTONE_PRESETS['custom']
    const milestones = milestoneNames.map((name, idx) => ({
      order_id: order.id,
      milestone_number: idx + 1,
      title: name,
    }))

    await supabase.from('commission_milestones').insert(milestones)

    // Escrow hold gold
    const { data: escrowResult } = await supabase
      .rpc('escrow_hold_gold', {
        p_user_id: user.id,
        p_order_id: order.id,
        p_amount: pkg.price_gold,
      })
      .single()

    if (!escrowResult?.success) {
      // Rollback order
      await supabase.from('commission_milestones').delete().eq('order_id', order.id)
      await supabase.from('commission_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: escrowResult?.error_message || '에스크로 처리 실패' }, { status: 400 })
    }

    // Increment used_slots
    await supabase
      .from('commission_packages')
      .update({ used_slots: pkg.used_slots + 1 })
      .eq('id', package_id)

    // Send notification to artist
    await supabase.from('notifications').insert({
      user_id: pkg.artist_id,
      type: 'commission_new_order',
      actor_id: user.id,
    })

    // System message
    await supabase.from('commission_messages').insert({
      order_id: order.id,
      sender_id: 'system',
      message_type: 'system',
      content: `주문이 접수되었습니다. (${orderNumber})`,
    })

    return NextResponse.json({ order, balance: escrowResult.new_balance }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
