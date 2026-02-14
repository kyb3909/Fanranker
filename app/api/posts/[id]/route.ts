import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient, createServiceRoleClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

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
        { error: '글을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (!post) {
      return NextResponse.json(
        { error: '글을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 2. 작성자 프로필 조회
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

/**
 * PATCH /api/posts/[id]
 * 글 수정 (작성자만)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await currentUser()
    if (!user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { community_slug, title, content, image } = body

    const supabase = createServiceRoleClient()
    const { data: existing } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (community_slug != null) updates.community_slug = community_slug
    if (title != null) updates.title = title
    if (content != null) updates.content = content
    if (image !== undefined) updates.image = image

    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

/**
 * DELETE /api/posts/[id]
 * 글 삭제 (작성자만, 소프트 삭제)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await currentUser()
    if (!user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { data: existing } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
