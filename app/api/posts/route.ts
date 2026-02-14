import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'
import { computeTemperature } from '@/lib/temperature'

/**
 * GET /api/posts
 * 글 목록 조회 (홈 피드용)
 *
 * Query Parameters:
 * - community_slug?: 특정 커뮤니티만 필터링
 * - sort?: "hot" | "new" | "comments" (정렬 방식)
 * - limit?: 페이지당 개수 (기본 20)
 * - offset?: 페이지네이션 오프셋 (기본 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAnonClient()
    const searchParams = request.nextUrl.searchParams
    
    const communitySlug = searchParams.get('community_slug')
    const sort = searchParams.get('sort') || 'new' // 'hot', 'new', 'comments', 'recent_comments'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))

    // 최근 댓글이 달린 게시물 조회
    if (sort === 'recent_comments') {
      // 1. 최근 댓글 조회 (최신 댓글 시간 순)
      const { data: recentComments, error: commentsError } = await supabase
        .from('comments')
        .select('post_id, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit * 10) // 충분한 댓글을 가져와서 중복 제거

      if (commentsError) {
        console.error('Failed to fetch recent comments:', commentsError)
        return NextResponse.json(
          { error: '댓글을 가져오는 중 오류가 발생했습니다.', details: commentsError.message },
          { status: 500 }
        )
      }

      if (!recentComments || recentComments.length === 0) {
        return NextResponse.json({ posts: [], profiles: [] })
      }

      // 2. post_id별로 가장 최근 댓글 시간 추출 (중복 제거)
      const postIdToLatestComment = new Map<string, Date>()
      recentComments.forEach((comment) => {
        const postId = comment.post_id
        const commentTime = new Date(comment.created_at)
        const existing = postIdToLatestComment.get(postId)
        if (!existing || commentTime > existing) {
          postIdToLatestComment.set(postId, commentTime)
        }
      })

      // 3. 최근 댓글 시간 순으로 정렬
      const sortedPostIds = Array.from(postIdToLatestComment.entries())
        .sort((a, b) => b[1].getTime() - a[1].getTime())
        .slice(0, limit)
        .map(([postId]) => postId)

      if (sortedPostIds.length === 0) {
        return NextResponse.json({ posts: [], profiles: [] })
      }

      // 4. 게시물 정보 조회
      let postsQuery = supabase
        .from('posts')
        .select(`
          id,
          user_id,
          community_slug,
          title,
          content,
          image,
          vote_count,
          comment_count,
          temperature,
          created_at
        `)
        .in('id', sortedPostIds)
        .is('deleted_at', null)

      // 커뮤니티 필터링
      if (communitySlug) {
        postsQuery = postsQuery.eq('community_slug', communitySlug)
      }

      const { data: posts, error: postsError } = await postsQuery

      if (postsError) {
        console.error('Failed to fetch posts:', postsError)
        return NextResponse.json(
          { error: '글 목록을 가져오는 중 오류가 발생했습니다.', details: postsError.message },
          { status: 500 }
        )
      }

      if (!posts || posts.length === 0) {
        return NextResponse.json({ posts: [], profiles: [] })
      }

      // 5. 최근 댓글 시간 순으로 정렬 (DB에서 가져온 순서 유지)
      const postMap = new Map(posts.map((p) => [p.id, p]))
      const sortedPosts = sortedPostIds
        .map((id) => postMap.get(id))
        .filter((p): p is typeof posts[0] => p !== undefined)

      // 6. 온도 계산 (comment_count는 DB 트리거가 관리하므로 그대로 사용)
      const postsWithAccurateCounts = sortedPosts.map((post) => {
        const row = { ...post, latest_comment_at: postIdToLatestComment.get(post.id)?.toISOString() || post.created_at }
        return { ...row, temperature: computeTemperature(row) }
      })

      // 7. 작성자 프로필 조회
      const userIds = [...new Set(sortedPosts.map((p) => p.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url')
        .in('user_id', userIds)

      return NextResponse.json({ posts: postsWithAccurateCounts, profiles: profiles || [] })
    }

    // 기존 정렬 로직 (hot, new, comments) — 메인 피드는 최근 24시간만
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let query = supabase
      .from('posts')
      .select(`
        id,
        user_id,
        community_slug,
        title,
        content,
        image,
        vote_count,
        comment_count,
        temperature,
        created_at
      `)
      .is('deleted_at', null)
      .gte('created_at', since24h)
      .range(offset, offset + limit - 1)

    // 커뮤니티 필터링
    if (communitySlug) {
      query = query.eq('community_slug', communitySlug)
    }

    // 정렬 (hot은 나중에 계산된 temperature로 메모리 정렬)
    switch (sort) {
      case 'hot':
        query = query.order('created_at', { ascending: false })
        break
      case 'comments':
        query = query.order('comment_count', { ascending: false })
        break
      case 'new':
      default:
        query = query.order('created_at', { ascending: false })
        break
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('Failed to fetch posts:', error)
      return NextResponse.json(
        { error: '글 목록을 가져오는 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ posts: [], profiles: [] })
    }

    // 2. 반감기 적용 온도 계산 (comment_count는 DB 트리거가 관리하므로 그대로 사용)
    let postsWithAccurateCounts = posts.map((post) => {
      return { ...post, temperature: computeTemperature(post) }
    })

    if (sort === 'hot') {
      postsWithAccurateCounts = postsWithAccurateCounts.sort(
        (a, b) => (b.temperature ?? 0) - (a.temperature ?? 0)
      )
    }

    // 3. 작성자 프로필 조회
    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .in('user_id', userIds)

    return NextResponse.json({ posts: postsWithAccurateCounts, profiles })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/posts
 * 새 글 작성
 *
 * Route Handler에서 Supabase 서버 클라이언트를 사용합니다.
 * Clerk 인증된 사용자만 글을 작성할 수 있습니다.
 */
export async function POST(request: NextRequest) {
  try {
    // Clerk 인증 확인
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
    const body = await request.json()
    const { community_slug, title, content, image } = body

    // 유효성 검사
    if (!community_slug || !title || !content) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 이미지 URL 유효성 검사 (base64는 거부)
    let imageUrl = null
    if (image) {
      if (image.startsWith('data:image/')) {
        // base64 데이터 URL은 거부
        return NextResponse.json(
          { error: '이미지는 Supabase Storage URL만 사용할 수 있습니다. 이미지를 다시 업로드해주세요.' },
          { status: 400 }
        )
      } else if (image.startsWith('http://') || image.startsWith('https://')) {
        imageUrl = image
      } else {
        // 잘못된 형식
        return NextResponse.json(
          { error: '잘못된 이미지 URL 형식입니다.' },
          { status: 400 }
        )
      }
    }

    // Supabase에 글 저장
    // community_slug → category_id 변환은 DB 트리거가 자동 처리
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId, // Clerk user ID
        community_slug,
        title,
        content, // TipTap JSON
        image: imageUrl,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: '글 저장 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // 팔로워들에게 알림 생성 (비동기로 처리, 실패해도 무시)
    Promise.resolve(supabase
      .from('user_follows')
      .select('follower_id')
      .eq('followed_user_id', userId))
      .then(({ data: followers }) => {
        if (!followers || followers.length === 0) return

        // 각 팔로워에게 알림 생성
        const notifications = followers.map((follow) => ({
          user_id: follow.follower_id,
          type: 'new_post_by_followed',
          actor_id: userId,
          related_post_id: data.id,
          related_comment_id: null,
          is_read: false,
        }))

        return supabase.from('notifications').insert(notifications)
      })
      .then(() => {
        console.log(`Notifications created for followers of user ${userId}`)
      })
      .catch((err: unknown) => {
        console.error('Failed to create notifications for followers:', err)
      })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
