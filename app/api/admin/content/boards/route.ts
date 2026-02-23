import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'
import { writeAuditLog, getIpFromRequest } from '@/lib/admin/audit'
import { apiError, apiBadRequest } from '@/lib/api-error'

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ boards: data ?? [] })
  } catch (error) {
    return apiError('서버 오류', 500, error)
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
      return apiBadRequest('boardId가 필요합니다.')
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (icon !== undefined) updateData.icon = icon
    if (sort_order !== undefined) updateData.sort_order = sort_order
    if (is_active !== undefined) updateData.is_active = is_active

    const { error } = await supabase.from('categories').update(updateData).eq('id', boardId)
    if (error) return apiError(error.message, 500, error)

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
    return apiError('서버 오류', 500, error)
  }
}
