import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * GET /api/posts/my
 *
 * Get current user's posts
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    // Fetch user's posts
    const { data: posts, error: postsError } = await supabase
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
        created_at
      `)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (postsError) {
      console.error('Failed to fetch posts:', postsError)
      return NextResponse.json(
        { error: '글 목록을 가져오는 중 오류가 발생했습니다.', details: postsError.message },
        { status: 500 }
      )
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .eq('user_id', userId)
      .single()

    return NextResponse.json({
      posts: posts || [],
      profiles: profile ? [profile] : [],
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
