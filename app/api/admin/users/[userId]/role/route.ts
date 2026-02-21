import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi, isErrorResponse } from '@/lib/admin/require-admin-api'
import { writeAuditLog, getIpFromRequest } from '@/lib/admin/audit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId: adminId, supabase } = auth
    const { userId } = await params

    const body = await request.json()
    const { role } = body

    const validRoles = ['user', 'moderator', 'admin']
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: '유효한 role이 필요합니다: user, moderator, admin' }, { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      adminUserId: adminId,
      action: 'change_role',
      targetType: 'user',
      targetId: userId,
      details: { role },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Role change error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
