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
    const community = searchParams.get('community') || ''
    const showDeleted = searchParams.get('showDeleted') === 'true'
    const offset = (page - 1) * limit

    let query = supabase
      .from('posts')
      .select('id, user_id, title, community_slug, view_count, vote_count, comment_count, is_notice, created_at, deleted_at, profiles!inner(nickname)', { count: 'exact' })

    if (search) query = query.ilike('title', `%${search}%`)
    if (community) query = query.eq('community_slug', community)
    if (!showDeleted) query = query.is('deleted_at', null)

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ posts: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    console.error('Posts API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const { postId, action } = body

    if (!postId || !action) {
      return NextResponse.json({ error: 'postId와 action이 필요합니다.' }, { status: 400 })
    }

    let updateData: Record<string, unknown> = {}
    let auditAction = ''

    switch (action) {
      case 'delete':
        updateData = { deleted_at: new Date().toISOString() }
        auditAction = 'delete_post'
        break
      case 'restore':
        updateData = { deleted_at: null }
        auditAction = 'restore_post'
        break
      case 'toggle_notice':
        const { data: post } = await supabase.from('posts').select('is_notice').eq('id', postId).single()
        updateData = { is_notice: !post?.is_notice }
        auditAction = post?.is_notice ? 'unpin_post' : 'pin_post'
        break
      default:
        return NextResponse.json({ error: '잘못된 action입니다.' }, { status: 400 })
    }

    const { error } = await supabase.from('posts').update(updateData).eq('id', postId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: auditAction,
      targetType: 'post',
      targetId: postId,
      details: { action },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Posts PATCH error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
