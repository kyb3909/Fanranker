import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@clerk/nextjs/server'

/**
 * POST /api/admin/users/certify-expert
 * 
 * Manually certify a user as an expert (admin only)
 * 
 * Body:
 * - user_id: string (required) - User ID to certify
 * - revoke?: boolean - If true, revoke expert status instead of granting
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const userId = user.id

    // Check admin permission
    // API 라우트에서는 Service Role 클라이언트를 사용하여 RLS를 우회합니다.
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const supabaseCheck = createServiceRoleClient()
    const { data: adminProfile } = await supabaseCheck
      .from('profiles')
      .select('is_admin')
      .eq('user_id', userId)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const body = await request.json()
    const { user_id, revoke } = body

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id가 필요합니다.' },
        { status: 400 }
      )
    }

    // Check if user exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, is_expert')
      .eq('user_id', user_id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // Update expert status
    const updateData: {
      is_expert: boolean
      expert_certified_at?: string | null
      updated_at: string
    } = {
      is_expert: !revoke,
      updated_at: new Date().toISOString(),
    }

    if (!revoke && !profile.is_expert) {
      // Grant expert status - set certification time
      updateData.expert_certified_at = new Date().toISOString()
    } else if (revoke) {
      // Revoke expert status - clear certification time
      updateData.expert_certified_at = null
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('user_id', user_id)
      .select()
      .single()

    if (updateError) {
      console.error('Failed to update expert status:', updateError)
      return NextResponse.json(
        { error: '전문가 인증 상태 업데이트 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: revoke ? '전문가 인증이 해제되었습니다.' : '전문가 인증이 완료되었습니다.',
      profile: updatedProfile,
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
