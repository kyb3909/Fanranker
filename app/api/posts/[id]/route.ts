import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/server'

/**
 * GET /api/posts/[id]
 * 특정 글 상세 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAnonClient()

    // 1. 게시글 조회
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        id,
        user_id,
        community_slug,
        title,
        content,
        image,
        view_count,
        vote_count,
        comment_count,
        temperature,
        created_at,
        updated_at
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (postError) {
      console.error('Failed to fetch post:', postError)
      return NextResponse.json(
        { error: '글을 찾을 수 없습니다.', details: postError.message },
        { status: 404 }
      )
    }

    if (!post) {
      return NextResponse.json(
        { error: '글을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 2. 조회수 증가 (비동기로 처리, 실패해도 상관없음)
    supabase
      .from('posts')
      .update({ view_count: (post.view_count || 0) + 1 })
      .eq('id', id)
      .then(() => {
        // 조회수 증가 성공 (로그만)
        console.log(`View count increased for post ${id}`)
      })
      .catch((err) => {
        // 조회수 증가 실패해도 무시 (에러 로그만)
        console.error('Failed to increment view count:', err)
      })

    // 3. 작성자 프로필 조회
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .eq('user_id', post.user_id)
      .single()

    return NextResponse.json({
      post: {
        ...post,
        profile: profile || null,
      },
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
