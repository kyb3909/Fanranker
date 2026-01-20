import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * GET /api/bookmarks
 * 
 * Get current user's bookmarked posts
 * 
 * Query Parameters:
 * - limit?: number (default: 20)
 * - offset?: number (default: 0)
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
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Get bookmarks with post data
    const { data: bookmarks, error } = await supabase
      .from('bookmarks')
      .select(`
        id,
        created_at,
        post:posts!inner(
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
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Failed to fetch bookmarks:', error)
      return NextResponse.json(
        { error: '북마크를 가져오는 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // Get user profiles for posts
    if (bookmarks && bookmarks.length > 0) {
      const userIds = [...new Set(bookmarks.map((b: any) => b.post?.user_id).filter(Boolean))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url')
        .in('user_id', userIds)

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

      // Add profile data to posts
      const bookmarksWithProfiles = bookmarks.map((bookmark: any) => ({
        ...bookmark,
        post: bookmark.post ? {
          ...bookmark.post,
          profile: profileMap.get(bookmark.post.user_id) || null,
        } : null,
      }))

      return NextResponse.json({ bookmarks: bookmarksWithProfiles })
    }

    return NextResponse.json({ bookmarks: [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
