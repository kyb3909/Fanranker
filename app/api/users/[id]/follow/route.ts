import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * POST /api/users/[id]/follow
 * 
 * Follow or unfollow a user
 * 
 * Body:
 * - action?: "follow" | "unfollow" (default: "follow" - toggles if already following)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id: followedUserId } = await params
    const supabase = await createClient()
    const body = await request.json()
    const { action } = body

    if (!followedUserId) {
      return NextResponse.json(
        { error: '사용자 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    if (userId === followedUserId) {
      return NextResponse.json(
        { error: '자기 자신을 팔로우할 수 없습니다.' },
        { status: 400 }
      )
    }

    // Check if already following
    const { data: existingFollow, error: checkError } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('followed_user_id', followedUserId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Failed to check follow status:', checkError)
      return NextResponse.json(
        { error: '팔로우 상태 확인 중 오류가 발생했습니다.', details: checkError.message },
        { status: 500 }
      )
    }

    const isFollowing = !!existingFollow

    // Determine action
    let shouldFollow: boolean
    if (action === 'unfollow') {
      shouldFollow = false
    } else if (action === 'follow') {
      shouldFollow = true
    } else {
      // Toggle: follow if not following, unfollow if following
      shouldFollow = !isFollowing
    }

    if (shouldFollow && !isFollowing) {
      // Follow
      const { error: insertError } = await supabase
        .from('user_follows')
        .insert({
          follower_id: userId,
          followed_user_id: followedUserId,
        })

      if (insertError) {
        console.error('Failed to follow user:', insertError)
        return NextResponse.json(
          { error: '팔로우 중 오류가 발생했습니다.', details: insertError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, following: true })
    } else if (!shouldFollow && isFollowing) {
      // Unfollow
      const { error: deleteError } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', userId)
        .eq('followed_user_id', followedUserId)

      if (deleteError) {
        console.error('Failed to unfollow user:', deleteError)
        return NextResponse.json(
          { error: '언팔로우 중 오류가 발생했습니다.', details: deleteError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, following: false })
    } else {
      // Already in desired state
      return NextResponse.json({ success: true, following: shouldFollow })
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/users/[id]/follow
 * 
 * Check if current user is following the specified user
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ following: false })
    }

    const { id: followedUserId } = await params
    const supabase = await createClient()

    const { data: existingFollow, error } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('followed_user_id', followedUserId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to check follow status:', error)
      return NextResponse.json({ following: false })
    }

    return NextResponse.json({ following: !!existingFollow })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ following: false })
  }
}
