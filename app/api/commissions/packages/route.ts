import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient, createAnonClient } from '@/lib/supabase/server'

// GET /api/commissions/packages?artist_id=X&type=Y
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const artistId = searchParams.get('artist_id')
    const type = searchParams.get('type')

    const supabase = createAnonClient()
    let query = supabase
      .from('commission_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (artistId) query = query.eq('artist_id', artistId)
    if (type) query = query.eq('type', type)

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch packages:', error)
      return NextResponse.json({ error: '패키지 조회 실패' }, { status: 500 })
    }

    return NextResponse.json({ packages: data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

// POST /api/commissions/packages
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // Check if user is artist
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_artist')
      .eq('user_id', user.id)
      .single()

    if (!profile?.is_artist) {
      return NextResponse.json({ error: '작가만 패키지를 생성할 수 있습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { name, type, description, features, price_gold, delivery_days, max_revisions, example_images, max_slots } = body

    if (!name || !type || !price_gold || !delivery_days) {
      return NextResponse.json({ error: '필수 항목을 모두 입력해주세요.' }, { status: 400 })
    }

    if (price_gold <= 0 || delivery_days <= 0) {
      return NextResponse.json({ error: '가격과 작업일은 0보다 커야 합니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('commission_packages')
      .insert({
        artist_id: user.id,
        name,
        type,
        description: description || '',
        features: features || [],
        price_gold,
        delivery_days,
        max_revisions: max_revisions ?? 2,
        example_images: example_images || [],
        max_slots: max_slots ?? 3,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create package:', error)
      return NextResponse.json({ error: '패키지 생성 실패' }, { status: 500 })
    }

    return NextResponse.json({ package: data }, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
