import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

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
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { slug } = await params
    const supabase = await createClient()

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
      console.error('Failed to follow community:', error)
      return NextResponse.json(
        { error: '팔로우 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, following: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
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
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { slug } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('community_follows')
      .delete()
      .eq('user_id', userId)
      .eq('community_slug', slug)

    if (error) {
      console.error('Failed to unfollow community:', error)
      return NextResponse.json(
        { error: '팔로우 취소 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, following: false })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
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
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ following: false })
    }

    const { slug } = await params
    const supabase = await createClient()

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
