import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * GET /api/notifications
 * 알림 목록 조회
 *
 * Query Parameters:
 * - limit?: 결과 개수 (기본값: 20)
 * - unread_only?: 읽지 않은 알림만 (기본값: false)
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
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      console.error('Failed to create Supabase client:', errorMessage)
      return NextResponse.json(
        {
          error: '서버 설정 오류가 발생했습니다.',
          details: errorMessage,
        },
        { status: 500 }
      )
    }
    const searchParams = request.nextUrl.searchParams
    
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const unreadOnly = searchParams.get('unread_only') === 'true'

    // 알림 조회
    let query = supabase
      .from('notifications')
      .select(`
        id,
        type,
        actor_id,
        related_post_id,
        related_comment_id,
        is_read,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      console.error('Failed to fetch notifications:', error)
      return NextResponse.json(
        { error: '알림을 불러오는 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ notifications: [], profiles: [], posts: [] })
    }

    // 작성자 프로필 조회
    const actorIds = [...new Set(notifications.map((n) => n.actor_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .in('user_id', actorIds)

    // 관련 글 제목 조회 (알림 텍스트 생성용)
    const postIds = [...new Set(notifications.map((n) => n.related_post_id).filter(Boolean))]
    const { data: posts } = postIds.length > 0
      ? await supabase
          .from('posts')
          .select('id, title')
          .in('id', postIds)
      : { data: [] }

    return NextResponse.json({ notifications, profiles: profiles || [], posts: posts || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications
 * 알림 읽음 처리
 *
 * Body:
 * - notification_id?: 특정 알림 ID (없으면 모두 읽음 처리)
 */
export async function PATCH(request: NextRequest) {
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
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      console.error('Failed to create Supabase client:', errorMessage)
      return NextResponse.json(
        {
          error: '서버 설정 오류가 발생했습니다.',
          details: errorMessage,
        },
        { status: 500 }
      )
    }
    const body = await request.json()
    const { notification_id } = body

    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)

    if (notification_id) {
      query = query.eq('id', notification_id)
    }

    const { error } = await query

    if (error) {
      console.error('Failed to update notifications:', error)
      return NextResponse.json(
        { error: '알림 읽음 처리 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
