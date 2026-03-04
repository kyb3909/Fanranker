import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest } from '@/lib/api-error'
import { getDraftUser, BOT_IDS, getBotProfile, isBotUser } from '@/lib/draft/auth'
import { getDraftMode } from '@/lib/draft/modes'

/**
 * POST /api/games/draft/rooms/[roomId]/bot-fill
 * 빈 자리에 봇 채우기 + 자동 시작
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
      .from('draft_rooms').select('*').eq('id', roomId).single()

    if (roomErr || !room) return apiBadRequest('방을 찾을 수 없습니다.')
    if (room.status !== 'waiting') return apiBadRequest('대기 중인 방만 봇을 추가할 수 있습니다.')
    if (room.host_user_id !== user.id) return apiBadRequest('호스트만 봇을 추가할 수 있습니다.')

    // 현재 참가자 확인
    const { data: participants } = await supabase
      .from('draft_participants')
      .select('seat_index')
      .eq('room_id', room.id)
      .order('seat_index')

    const occupiedSeats = new Set(participants?.map(p => p.seat_index) || [])
    const emptySeats: number[] = []
    for (let i = 0; i < 4; i++) {
      if (!occupiedSeats.has(i)) emptySeats.push(i)
    }

    if (emptySeats.length === 0) return apiBadRequest('빈 자리가 없습니다.')

    // 빈 자리에 봇 추가
    const botInserts = emptySeats.map((seatIndex, i) => {
      const botId = BOT_IDS[i % BOT_IDS.length]
      const profile = getBotProfile(botId)
      // 같은 방에 같은 bot_id 중복 방지 위해 seat index 붙임
      const uniqueBotId = `${botId}_${room.id}_${seatIndex}`
      return {
        room_id: room.id,
        user_id: uniqueBotId,
        seat_index: seatIndex,
        display_name: profile.name,
        avatar_url: profile.avatar,
        is_ready: true,
      }
    })

    const { error: insertErr } = await supabase
      .from('draft_participants')
      .insert(botInserts)

    if (insertErr) return apiError('봇 추가에 실패했습니다.', 500, insertErr)

    // 자동 게임 시작
    const mode = getDraftMode(room.game_mode_id)
    if (!mode) return apiBadRequest('게임 모드를 찾을 수 없습니다.')

    const deadline = new Date(Date.now() + mode.timerSeconds * 1000).toISOString()
    const { data: updatedRoom, error: startErr } = await supabase
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

    if (startErr) return apiError('게임 시작에 실패했습니다.', 500, startErr)

    // 첫 턴이 봇이면 연쇄 픽 처리
    // → 클라이언트가 시작 후 reload하면 pick route에서 처리됨
    // 하지만 안전하게 여기서도 처리
    const allParticipants = [...(participants || []).map(p => ({
      user_id: `existing_${p.seat_index}`,
      seat_index: p.seat_index,
    })), ...botInserts.map(b => ({
      user_id: b.user_id,
      seat_index: b.seat_index,
    }))]

    // 실제 참가자 다시 조회
    const { data: allParts } = await supabase
      .from('draft_participants').select('*').eq('room_id', room.id)

    // 첫 턴이 봇인지 확인하고 연쇄 처리
    let currentPick = 0
    const totalPicks = mode.teamCount * mode.picksPerTeam
    const allPlayers = mode.getPlayers()
    const picks: { player_id: string; seat_index: number; pick_number: number }[] = []

    while (currentPick < totalPicks) {
      const nextSeat = updatedRoom!.snake_order[currentPick]
      const nextParticipant = allParts?.find(p => p.seat_index === nextSeat)

      if (!nextParticipant || !isBotUser(nextParticipant.user_id)) break

      const { autoPickPlayer } = await import('@/lib/draft/validation')
      const botPlayer = autoPickPlayer(
        picks.map((p, i) => ({ id: i, room_id: room.id, pick_number: p.pick_number, seat_index: p.seat_index, player_id: p.player_id, is_auto_pick: true, picked_at: '' })),
        nextSeat,
        allPlayers,
        mode
      )
      if (!botPlayer) break

      await supabase.from('draft_picks').insert({
        room_id: room.id,
        pick_number: currentPick,
        seat_index: nextSeat,
        player_id: botPlayer.id,
        is_auto_pick: true,
      })

      picks.push({ player_id: botPlayer.id, seat_index: nextSeat, pick_number: currentPick })
      currentPick++
    }

    // current_pick 업데이트
    if (currentPick > 0) {
      const newDeadline = new Date(Date.now() + mode.timerSeconds * 1000).toISOString()
      await supabase.from('draft_rooms').update({
        current_pick: currentPick,
        pick_deadline_at: newDeadline,
        updated_at: new Date().toISOString(),
      }).eq('id', room.id)
    }

    return NextResponse.json({
      success: true,
      botsAdded: botInserts.length,
      room: { ...updatedRoom, current_pick: currentPick },
    })
  } catch (error) {
    return apiError('봇 추가 중 오류가 발생했습니다.', 500, error)
  }
}
