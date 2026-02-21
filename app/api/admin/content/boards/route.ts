import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'
import { writeAuditLog, getIpFromRequest } from '@/lib/admin/audit'

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ boards: data ?? [] })
  } catch (error) {
    console.error('Boards API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const { boardId, name, description, icon, sort_order, is_active } = body

    if (!boardId) {
      return NextResponse.json({ error: 'boardId가 필요합니다.' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (icon !== undefined) updateData.icon = icon
    if (sort_order !== undefined) updateData.sort_order = sort_order
    if (is_active !== undefined) updateData.is_active = is_active

    const { error } = await supabase.from('categories').update(updateData).eq('id', boardId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: 'update_board',
      targetType: 'board',
      targetId: boardId,
      details: updateData,
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Boards PATCH error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
