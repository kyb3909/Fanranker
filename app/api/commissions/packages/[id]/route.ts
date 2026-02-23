import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

// PATCH /api/commissions/packages/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id } = await params
    const supabase = createServiceRoleClient()

    // Verify ownership
    const { data: pkg } = await supabase
      .from('commission_packages')
      .select('artist_id')
      .eq('id', id)
      .single()

    if (!pkg) return NextResponse.json({ error: '패키지를 찾을 수 없습니다.' }, { status: 404 })
    if (pkg.artist_id !== user.id) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    const body = await request.json()
    const allowedFields = ['name', 'type', 'description', 'features', 'price_gold', 'delivery_days', 'max_revisions', 'example_images', 'is_active', 'max_slots', 'sort_order']
    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('commission_packages')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return apiError('패키지 수정 실패', 500, error)
    }

    return NextResponse.json({ package: data })
  } catch (error) {
    return apiError('서버 오류', 500, error)
  }
}
