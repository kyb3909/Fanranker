import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || ''
    const offset = (page - 1) * limit

    let query = supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url, role, temperature, is_expert, is_artist, created_at, updated_at', { count: 'exact' })

    if (search) query = query.ilike('nickname', `%${search}%`)
    if (role) query = query.eq('role', role)

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ users: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    console.error('Users API error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
