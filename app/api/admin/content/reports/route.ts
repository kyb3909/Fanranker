import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'
import { writeAuditLog, getIpFromRequest } from '@/lib/admin/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const offset = (page - 1) * limit

    let query = supabase
      .from('content_reports')
      .select('*', { count: 'exact' })

    if (status !== 'all') query = query.eq('status', status)

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reports: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    console.error('Reports API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const { reportId, action, resolution } = body

    if (!reportId || !action) {
      return NextResponse.json({ error: 'reportId와 action이 필요합니다.' }, { status: 400 })
    }

    let updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    let auditAction = ''

    switch (action) {
      case 'resolve':
        updateData.status = 'resolved'
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = userId
        updateData.resolution = resolution || ''
        auditAction = 'resolve_report'
        break
      case 'dismiss':
        updateData.status = 'dismissed'
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = userId
        updateData.resolution = resolution || 'dismissed'
        auditAction = 'dismiss_report'
        break
      case 'reviewing':
        updateData.status = 'reviewing'
        updateData.assigned_to = userId
        auditAction = 'review_report'
        break
      default:
        return NextResponse.json({ error: '잘못된 action입니다.' }, { status: 400 })
    }

    const { error } = await supabase.from('content_reports').update(updateData).eq('id', reportId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: auditAction,
      targetType: 'report',
      targetId: reportId,
      details: { action, resolution },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reports PATCH error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
