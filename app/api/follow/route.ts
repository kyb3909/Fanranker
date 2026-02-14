import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * GET /api/follow
 *
 * 내가 팔로우한 유저 목록 반환
 * Response: { following: string[] }
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ following: [] })
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('user_follows')
      .select('followed_user_id')
      .eq('follower_id', user.id)

    if (error) {
      return NextResponse.json(
        { error: '팔로우 목록 조회 실패' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      following: (data || []).map(d => d.followed_user_id),
    })
  } catch (e) {
    console.error('Follow GET error:', e)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

/**
 * POST /api/follow
 *
 * 팔로우/언팔로우 토글
 * Body: { user_id: string }
 * Response: { action: 'followed' | 'unfollowed' }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const targetUserId: string | undefined = body.user_id

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'user_id가 필요합니다.' },
        { status: 400 }
      )
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: '자기 자신을 팔로우할 수 없습니다.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // 이미 팔로우 중인지 확인
    const { data: existing } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('followed_user_id', targetUserId)
      .single()

    if (existing) {
      // 언팔로우
      const { error: deleteError } = await supabase
        .from('user_follows')
        .delete()
        .eq('id', existing.id)

      if (deleteError) {
        return NextResponse.json(
          { error: '언팔로우 처리에 실패했습니다.' },
          { status: 500 }
        )
      }

      return NextResponse.json({ action: 'unfollowed' })
    } else {
      // 팔로우
      const { error } = await supabase
        .from('user_follows')
        .insert({
          follower_id: user.id,
          followed_user_id: targetUserId,
        })

      if (error) {
        return NextResponse.json(
          { error: '팔로우 실패' },
          { status: 500 }
        )
      }

      return NextResponse.json({ action: 'followed' })
    }
  } catch (e) {
    console.error('Follow POST error:', e)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
