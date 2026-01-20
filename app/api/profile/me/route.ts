import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auth } from '@clerk/nextjs/server'

/**
 * GET /api/profile/me
 *
 * Get current user's profile
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

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to fetch profile:', error)
      return NextResponse.json(
        { error: '프로필을 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json(profile || {})
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/profile/me
 *
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { nickname, avatar_url, notification_settings } = body

    const supabase = await createClient()

    // Build update object
    const updateData: any = {}
    if (nickname !== undefined) updateData.nickname = nickname
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url
    if (notification_settings !== undefined) updateData.notification_settings = notification_settings

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      // If profile doesn't exist, create it
      if (error.code === 'PGRST116') {
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            ...updateData,
          })
          .select()
          .single()

        if (insertError) {
          console.error('Failed to create profile:', insertError)
          return NextResponse.json(
            { error: '프로필 생성 중 오류가 발생했습니다.' },
            { status: 500 }
          )
        }

        return NextResponse.json(newProfile)
      }

      console.error('Failed to update profile:', error)
      return NextResponse.json(
        { error: '프로필 업데이트 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/profile/me
 *
 * Delete current user's account (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    // Soft delete - mark profile as deleted
    const { error } = await supabase
      .from('profiles')
      .update({
        deleted_at: new Date().toISOString(),
        nickname: '[삭제된 사용자]',
      })
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to delete profile:', error)
      return NextResponse.json(
        { error: '계정 삭제 중 오류가 발생했습니다.' },
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
