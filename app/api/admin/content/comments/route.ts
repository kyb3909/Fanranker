import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'
import { writeAuditLog, getIpFromRequest } from '@/lib/admin/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const search = searchParams.get('search') || ''
    const showDeleted = searchParams.get('showDeleted') === 'true'
    const offset = (page - 1) * limit

    let query = supabase
      .from('comments')
      .select('id, post_id, user_id, content, vote_count, depth, created_at, deleted_at, profiles!inner(nickname), posts!inner(title)', { count: 'exact' })

    if (search) query = query.ilike('content', `%${search}%`)
    if (!showDeleted) query = query.is('deleted_at', null)

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ comments: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    console.error('Comments API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const { commentId, action } = body

    if (!commentId || !action) {
      return NextResponse.json({ error: 'commentId와 action이 필요합니다.' }, { status: 400 })
    }

    let updateData: Record<string, unknown> = {}
    let auditAction = ''

    if (action === 'delete') {
      updateData = { deleted_at: new Date().toISOString() }
      auditAction = 'delete_comment'
    } else if (action === 'restore') {
      updateData = { deleted_at: null }
      auditAction = 'restore_comment'
    } else {
      return NextResponse.json({ error: '잘못된 action입니다.' }, { status: 400 })
    }

    const { error } = await supabase.from('comments').update(updateData).eq('id', commentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: auditAction,
      targetType: 'comment',
      targetId: commentId,
      details: { action },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Comments PATCH error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
