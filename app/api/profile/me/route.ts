import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { apiError } from '@/lib/api-error'

/**
 * GET /api/profile/me
 *
 * Get current user's profile
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
        { error: '서버 설정 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, user_id, nickname, avatar_url, temperature, role, notification_settings, created_at, updated_at')
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
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}

/**
 * PATCH /api/profile/me
 *
 * Update current user's profile
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

    const body = await request.json()
    const { nickname, avatar_url, notification_settings } = body

    // 닉네임 유효성 검사
    if (nickname !== undefined) {
      const trimmedNickname = nickname.trim()
      if (trimmedNickname.length < 2) {
        return NextResponse.json(
          { error: '닉네임은 2자 이상이어야 합니다.' },
          { status: 400 }
        )
      }
      if (trimmedNickname.length > 20) {
        return NextResponse.json(
          { error: '닉네임은 20자 이하여야 합니다.' },
          { status: 400 }
        )
      }
    }

    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    let supabase
    try {
      supabase = createServiceRoleClient()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      console.error('Failed to create Supabase client:', errorMessage)
      return NextResponse.json(
        { error: '서버 설정 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // avatar_url 도메인 검증
    if (avatar_url !== undefined && avatar_url !== null) {
      const { isAllowedImageUrl } = await import('@/lib/validate-image-url')
      if (!isAllowedImageUrl(avatar_url)) {
        return NextResponse.json(
          { error: '허용되지 않은 이미지 URL입니다.' },
          { status: 400 }
        )
      }
    }

    // Build update object
    const updateData: { nickname?: string; avatar_url?: string | null; notification_settings?: Record<string, unknown> } = {}
    if (nickname !== undefined) updateData.nickname = nickname.trim()
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url
    if (notification_settings !== undefined) updateData.notification_settings = notification_settings

    // 먼저 프로필이 존재하는지 확인
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .single()

    let profile
    let error

    if (fetchError && fetchError.code === 'PGRST116') {
      // 프로필이 없으면 생성 (기본값 포함)
      const defaultNickname = user.username || user.firstName || `User_${userId.slice(-8)}`
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          nickname: updateData.nickname || defaultNickname,
          avatar_url: updateData.avatar_url || user.imageUrl || null,
          ...(notification_settings !== undefined ? { notification_settings: notification_settings } : {}),
        })
        .select('id, user_id, nickname, avatar_url, temperature, role, notification_settings, created_at, updated_at')
        .single()

      profile = newProfile
      error = insertError

      if (error) {
        console.error('Failed to create profile:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId,
        })
        return NextResponse.json(
          { error: '프로필 생성 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
    } else if (fetchError) {
      // 다른 에러
      console.error('Failed to check profile existence:', {
        error: fetchError,
        code: fetchError.code,
        message: fetchError.message,
        userId,
      })
      return NextResponse.json(
        { error: '프로필 확인 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    } else {
      // 프로필이 존재하면 업데이트
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select('id, user_id, nickname, avatar_url, temperature, role, notification_settings, created_at, updated_at')
        .single()

      profile = updatedProfile
      error = updateError

      if (error) {
        console.error('Failed to update profile:', {
          error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId,
          updateData,
        })
        return NextResponse.json(
          { error: '프로필 업데이트 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(profile)
  } catch (error) {
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}

/**
 * DELETE /api/profile/me
 *
 * Delete current user's account (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    // Require explicit confirmation to prevent CSRF and accidental deletion
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    if (body.confirm !== '계정삭제') {
      return NextResponse.json(
        { error: '계정 삭제를 확인하려면 "계정삭제"를 입력해주세요.' },
        { status: 400 }
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
        { error: '서버 설정 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

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
    return apiError('서버 오류가 발생했습니다.', 500, error)
  }
}
