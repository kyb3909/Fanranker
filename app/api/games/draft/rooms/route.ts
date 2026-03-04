import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest, checkRateLimit } from '@/lib/api-error'
import { getDraftMode } from '@/lib/draft/modes'
import { generateRoomCode, generateSnakeDraftOrder } from '@/lib/draft/utils'
import { getDraftUser } from '@/lib/draft/auth'

/**
 * POST /api/games/draft/rooms — 방 생성
 */
export async function POST(request: Request) {
  const limited = checkRateLimit(request, 'STRICT')
  if (limited) return limited

  const user = await getDraftUser(request)
  if (!user) return apiBadRequest('게스트 ID가 필요합니다. (x-guest-id 헤더)')

  try {
    const { modeId } = await request.json()
    const mode = getDraftMode(modeId)
    if (!mode) return apiBadRequest('존재하지 않는 게임 모드입니다.')

    const supabase = createServiceRoleClient()

    // 유니크 방 코드 생성 (충돌 시 재시도)
    let roomCode = generateRoomCode()
    for (let i = 0; i < 5; i++) {
      const { data: dup } = await supabase
        .from('draft_rooms')
        .select('id')
        .eq('room_code', roomCode)
        .limit(1)
      if (!dup || dup.length === 0) break
      roomCode = generateRoomCode()
    }

    const totalPicks = mode.teamCount * mode.picksPerTeam
    const snakeOrder = generateSnakeDraftOrder(totalPicks, mode.teamCount)

    // 방 생성
    const { data: room, error: roomErr } = await supabase
      .from('draft_rooms')
      .insert({
        room_code: roomCode,
        game_mode_id: modeId,
        host_user_id: user.id,
        status: 'waiting',
        snake_order: snakeOrder,
      })
      .select()
      .single()

    if (roomErr) return apiError('방 생성에 실패했습니다.', 500, roomErr)

    // 호스트를 seat 0으로 참가
    const { error: joinErr } = await supabase
      .from('draft_participants')
      .insert({
        room_id: room.id,
        user_id: user.id,
        seat_index: 0,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
      })

    if (joinErr) return apiError('방 참가에 실패했습니다.', 500, joinErr)

    return NextResponse.json({ room })
  } catch (error) {
    return apiError('방 생성 중 오류가 발생했습니다.', 500, error)
  }
}

/**
 * GET /api/games/draft/rooms — 내가 참가 중인 방 목록
 */
export async function GET(request: Request) {
  const user = await getDraftUser(request)
  if (!user) return NextResponse.json({ rooms: [] })

  try {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('draft_participants')
      .select('room_id, seat_index, draft_rooms(*)')
      .eq('user_id', user.id)
      .in('draft_rooms.status', ['waiting', 'drafting'])
      .order('joined_at', { ascending: false })
      .limit(5)

    if (error) return apiError('방 목록 조회에 실패했습니다.', 500, error)

    return NextResponse.json({ rooms: data })
  } catch (error) {
    return apiError('방 목록 조회 중 오류가 발생했습니다.', 500, error)
  }
}
