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
    const community = searchParams.get('community') || ''
    const offset = (page - 1) * limit

    let query = supabase
      .from('news_ticker_items')
      .select('id, source_id, community_slug, headline_kr, original_title, importance, category, ticker_tag, posted_at, created_at', { count: 'exact' })

    if (community) query = query.eq('community_slug', community)

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    console.error('Ticker API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const { itemId, importance } = body

    if (!itemId || importance === undefined) {
      return NextResponse.json({ error: 'itemId와 importance가 필요합니다.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('news_ticker_items')
      .update({ importance: parseInt(importance) })
      .eq('id', itemId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: 'update_ticker_importance',
      targetType: 'ticker',
      targetId: String(itemId),
      details: { importance },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Ticker PATCH error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('id')

    if (!itemId) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    }

    const { error } = await supabase.from('news_ticker_items').delete().eq('id', itemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: userId,
      action: 'delete_ticker_item',
      targetType: 'ticker',
      targetId: itemId,
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Ticker DELETE error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
