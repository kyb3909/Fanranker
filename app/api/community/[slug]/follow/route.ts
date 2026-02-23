import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError, apiUnauthorized, checkRateLimit } from '@/lib/api-error'

/**
 * POST /api/community/[slug]/follow
 *
 * Follow a community
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id
    const { slug } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    // Check if already following
    const { data: existing } = await supabase
      .from('community_follows')
      .select('id')
      .eq('user_id', userId)
      .eq('community_slug', slug)
      .single()

    if (existing) {
      return NextResponse.json({ success: true, following: true })
    }

    // Add follow
    const { error } = await supabase
      .from('community_follows')
      .insert({
        user_id: userId,
        community_slug: slug,
      })

    if (error) {
      return apiError('팔로우 중 오류가 발생했습니다.', 500, error)
    }

    return NextResponse.json({ success: true, following: true })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}

/**
 * DELETE /api/community/[slug]/follow
 *
 * Unfollow a community
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id
    const { slug } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('community_follows')
      .delete()
      .eq('user_id', userId)
      .eq('community_slug', slug)

    if (error) {
      return apiError('팔로우 취소 중 오류가 발생했습니다.', 500, error)
    }

    return NextResponse.json({ success: true, following: false })
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}

/**
 * GET /api/community/[slug]/follow
 *
 * Check if current user is following this community
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json({ following: false })
    }

    const userId = user.id

    const { slug } = await params

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabase = createServiceRoleClient()

    const { data } = await supabase
      .from('community_follows')
      .select('id')
      .eq('user_id', userId)
      .eq('community_slug', slug)
      .single()

    return NextResponse.json({ following: !!data })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ following: false })
  }
}
