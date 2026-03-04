import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest } from '@/lib/api-error'
import { getDraftMode } from '@/lib/draft/modes'
import { getDraftUser, isBotUser } from '@/lib/draft/auth'

/**
 * POST /api/games/draft/rooms/[roomId]/start — 게임 시작 (호스트만)
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

    const { data: room, error: roomErr } = await supabase
      .from('draft_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomErr || !room) return apiBadRequest('방을 찾을 수 없습니다.')
    if (room.host_user_id !== user.id) return apiBadRequest('호스트만 게임을 시작할 수 있습니다.')
    if (room.status !== 'waiting') return apiBadRequest('이미 시작된 게임입니다.')

    const { data: participants } = await supabase
      .from('draft_participants')
      .select('*')
      .eq('room_id', room.id)

    if (!participants || participants.length < 2) {
      return apiBadRequest('최소 2명이 필요합니다.')
    }

    // 호스트/봇 제외 실제 유저 중 미준비 확인
    const notReady = participants.filter(
      p => p.user_id !== user.id && !isBotUser(p.user_id) && !p.is_ready
    )
    if (notReady.length > 0) {
      return apiBadRequest('모든 참가자가 준비를 완료해야 합니다.')
    }

    const mode = getDraftMode(room.game_mode_id)
    if (!mode) return apiBadRequest('게임 모드를 찾을 수 없습니다.')

    const deadline = new Date(Date.now() + mode.timerSeconds * 1000).toISOString()
    const { data: updatedRoom, error: updateErr } = await supabase
      .from('draft_rooms')
      .update({
        status: 'drafting',
        current_pick: 0,
        pick_deadline_at: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq('id', room.id)
      .select()
      .single()

    if (updateErr) return apiError('게임 시작에 실패했습니다.', 500, updateErr)

    return NextResponse.json({ room: updatedRoom })
  } catch (error) {
    return apiError('게임 시작 중 오류가 발생했습니다.', 500, error)
  }
}
