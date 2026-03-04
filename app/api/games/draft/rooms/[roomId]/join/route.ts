import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest, checkRateLimit } from '@/lib/api-error'
import { getDraftUser } from '@/lib/draft/auth'

/**
 * POST /api/games/draft/rooms/[roomId]/join — 방 참가
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const limited = checkRateLimit(request, 'STRICT')
  if (limited) return limited

  const user = await getDraftUser(request)
  if (!user) return apiBadRequest('게스트 ID가 필요합니다.')

  const { roomId } = await params

  try {
    const supabase = createServiceRoleClient()

    const { data: room, error: roomErr } = await supabase
      .from('draft_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomErr || !room) return apiBadRequest('존재하지 않는 방입니다.')
    if (room.status !== 'waiting') return apiBadRequest('이미 시작된 방입니다.')

    // 이미 참가 중인지 확인
    const { data: existing } = await supabase
      .from('draft_participants')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .limit(1)

    if (existing && existing.length > 0) {
      return apiBadRequest('이미 참가 중입니다.')
    }

    // 현재 참가자 수 확인
    const { data: participants } = await supabase
      .from('draft_participants')
      .select('seat_index')
      .eq('room_id', room.id)
      .order('seat_index')

    if (participants && participants.length >= 4) {
      return apiBadRequest('방이 가득 찼습니다.')
    }

    // 빈 자리 찾기
    const occupiedSeats = new Set(participants?.map(p => p.seat_index) || [])
    let seatIndex = -1
    for (let i = 0; i < 4; i++) {
      if (!occupiedSeats.has(i)) { seatIndex = i; break }
    }
    if (seatIndex === -1) return apiBadRequest('빈 자리가 없습니다.')

    const { data: participant, error: joinErr } = await supabase
      .from('draft_participants')
      .insert({
        room_id: room.id,
        user_id: user.id,
        seat_index: seatIndex,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
      })
      .select()
      .single()

    if (joinErr) return apiError('참가에 실패했습니다.', 500, joinErr)

    return NextResponse.json({ participant })
  } catch (error) {
    return apiError('참가 중 오류가 발생했습니다.', 500, error)
  }
}
