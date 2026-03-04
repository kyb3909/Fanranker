import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest } from '@/lib/api-error'
import { getDraftUser } from '@/lib/draft/auth'

/**
 * POST /api/games/draft/rooms/[roomId]/ready — 준비 토글
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const user = await getDraftUser(request)
  if (!user) return apiBadRequest('인증이 필요합니다.')

  const { roomId } = await params

  try {
    const supabase = createServiceRoleClient()

    const { data: participant, error: pErr } = await supabase
      .from('draft_participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .single()

    if (pErr || !participant) return apiBadRequest('방에 참가하지 않았습니다.')

    const newReady = !participant.is_ready
    const { error: updateErr } = await supabase
      .from('draft_participants')
      .update({ is_ready: newReady })
      .eq('id', participant.id)

    if (updateErr) return apiError('준비 상태 변경에 실패했습니다.', 500, updateErr)

    return NextResponse.json({ is_ready: newReady })
  } catch (error) {
    return apiError('준비 상태 변경 중 오류가 발생했습니다.', 500, error)
  }
}
