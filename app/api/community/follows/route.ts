import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * GET /api/community/follows
 *
 * Get current user's followed communities
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
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
      console.error('Failed to fetch followed communities:', error)
      return NextResponse.json(
        { error: '팔로우한 게시판을 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ communities: communities || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
