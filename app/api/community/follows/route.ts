import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError, apiUnauthorized } from '@/lib/api-error'

/**
 * GET /api/community/follows
 *
 * Get current user's followed communities
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    const { data: communities, error } = await supabase
      .from('community_follows')
      .select('community_slug, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      return apiError('팔로우한 게시판을 가져오는 중 오류가 발생했습니다.', 500, error)
    }

    return NextResponse.json({ communities: communities || [] })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
