import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

interface AdminAuth {
  userId: string
  supabase: ReturnType<typeof createServiceRoleClient>
}

/**
 * Verify admin access in API routes.
 * Returns admin userId and service-role supabase client, or a NextResponse error.
 */
export async function requireAdminApi(): Promise<AdminAuth | NextResponse> {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return { userId: user.id, supabase }
}

export function isErrorResponse(result: AdminAuth | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
