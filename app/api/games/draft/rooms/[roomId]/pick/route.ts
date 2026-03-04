import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest, checkRateLimit } from '@/lib/api-error'
import { getDraftMode } from '@/lib/draft/modes'
import { getDraftUser, isBotUser } from '@/lib/draft/auth'
import { validatePositionConstraint, validateSalaryCap, calculateSpent, getPositionCounts, autoPickPlayer } from '@/lib/draft/validation'
import type { DraftPick } from '@/lib/draft/types'

/**
 * POST /api/games/draft/rooms/[roomId]/pick — 선수 선택
 * body: { playerId: string }
 *
 * 픽 후 다음 턴이 봇이면 봇 픽을 연쇄 실행
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const limited = checkRateLimit(request, 'STRICT')
  if (limited) return limited

  const user = await getDraftUser(request)
  if (!user) return apiBadRequest('인증이 필요합니다.')

  const { roomId } = await params
  const { playerId } = await request.json()

  if (!playerId) return apiBadRequest('선수를 선택해주세요.')

  try {
    const supabase = createServiceRoleClient()

    // 방 확인
    const { data: room, error: roomErr } = await supabase
      .from('draft_rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomErr || !room) return apiBadRequest('방을 찾을 수 없습니다.')
    if (room.status !== 'drafting') return apiBadRequest('드래프트가 진행 중이 아닙니다.')

    // 참가자 확인
    const { data: participants } = await supabase
      .from('draft_participants')
      .select('*')
      .eq('room_id', room.id)

    const participant = participants?.find(p => p.user_id === user.id)
    if (!participant) return apiBadRequest('방에 참가하지 않았습니다.')

    // 턴 검증
    const currentSeat = room.snake_order[room.current_pick]
    if (participant.seat_index !== currentSeat) {
      return apiBadRequest('현재 당신의 턴이 아닙니다.')
    }

    const mode = getDraftMode(room.game_mode_id)
    if (!mode) return apiBadRequest('게임 모드를 찾을 수 없습니다.')

    const allPlayers = mode.getPlayers()
    const player = allPlayers.find(p => p.id === playerId)
    if (!player) return apiBadRequest('존재하지 않는 선수입니다.')

    // 기존 픽 조회
    const { data: existingPicks } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('room_id', room.id)
      .order('pick_number')

    const picks = existingPicks || []

    if (picks.some(p => p.player_id === playerId)) {
      return apiBadRequest('이미 선택된 선수입니다.')
    }

    // 포지션 + 캡 검증
    const positionCounts = getPositionCounts(picks, participant.seat_index, allPlayers)
    const posCheck = validatePositionConstraint(player.position, positionCounts, mode.positions)
    if (!posCheck.valid) return apiBadRequest(posCheck.reason!)

    const spent = calculateSpent(picks, participant.seat_index, allPlayers)
    const myPickCount = picks.filter(p => p.seat_index === participant.seat_index).length
    const remainingPicks = mode.picksPerTeam - myPickCount
    const capCheck = validateSalaryCap(player.cost, spent, mode.salaryCap, remainingPicks)
    if (!capCheck.valid) return apiBadRequest(capCheck.reason!)

    // 픽 삽입
    const { data: pick, error: pickErr } = await supabase
      .from('draft_picks')
      .insert({
        room_id: room.id,
        pick_number: room.current_pick,
        seat_index: participant.seat_index,
        player_id: playerId,
        is_auto_pick: false,
      })
      .select()
      .single()

    if (pickErr) return apiError('선수 선택에 실패했습니다.', 500, pickErr)

    // 다음 픽 진행 + 봇 연쇄 픽
    const totalPicks = mode.teamCount * mode.picksPerTeam
    const allCurrentPicks = [...picks, pick]
    const botPicks: DraftPick[] = []

    let nextPick = room.current_pick + 1

    // 봇 연쇄 픽
    while (nextPick < totalPicks) {
      const nextSeat = room.snake_order[nextPick]
      const nextParticipant = participants?.find(p => p.seat_index === nextSeat)

      if (!nextParticipant || !isBotUser(nextParticipant.user_id)) break

      // 봇 자동 픽
      const botPlayer = autoPickPlayer(allCurrentPicks, nextSeat, allPlayers, mode)
      if (!botPlayer) break

      const { data: botPick, error: botErr } = await supabase
        .from('draft_picks')
        .insert({
          room_id: room.id,
          pick_number: nextPick,
          seat_index: nextSeat,
          player_id: botPlayer.id,
          is_auto_pick: true,
        })
        .select()
        .single()

      if (botErr) break

      allCurrentPicks.push(botPick)
      botPicks.push(botPick)
      nextPick++
    }

    // 게임 완료 체크
    if (nextPick >= totalPicks) {
      await completeGame(supabase, room.id, mode, allPlayers)
      const { data: completedRoom } = await supabase
        .from('draft_rooms').select('*').eq('id', room.id).single()

      return NextResponse.json({
        pick,
        botPicks,
        room: completedRoom,
        completed: true,
      })
    }

    // 다음 턴 설정
    const deadline = new Date(Date.now() + mode.timerSeconds * 1000).toISOString()
    const { data: updatedRoom } = await supabase
      .from('draft_rooms')
      .update({
        current_pick: nextPick,
        pick_deadline_at: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq('id', room.id)
      .select()
      .single()

    return NextResponse.json({
      pick,
      botPicks,
      room: updatedRoom,
      completed: false,
    })
  } catch (error) {
    return apiError('선수 선택 중 오류가 발생했습니다.', 500, error)
  }
}

async function completeGame(
  supabase: ReturnType<typeof createServiceRoleClient>,
  roomId: number,
  mode: NonNullable<ReturnType<typeof getDraftMode>>,
  allPlayers: { id: string; cost: number }[]
) {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))

  const { data: picks } = await supabase
    .from('draft_picks').select('*').eq('room_id', roomId)

  const { data: participants } = await supabase
    .from('draft_participants').select('*').eq('room_id', roomId)

  if (!picks || !participants) return

  const results = participants.map(p => {
    const myPicks = picks.filter(pk => pk.seat_index === p.seat_index)
    const playerIds = myPicks.map(pk => pk.player_id)
    const totalCost = myPicks.reduce((sum, pk) => {
      return sum + (playerMap.get(pk.player_id)?.cost || 0)
    }, 0)

    return {
      room_id: roomId,
      user_id: p.user_id,
      seat_index: p.seat_index,
      total_cost: totalCost,
      player_ids: playerIds,
      gold_rewarded: isBotUser(p.user_id) ? 0 : 10,
    }
  })

  await supabase.from('draft_results').insert(results)

  // 실제 유저에게만 골드 지급
  for (const r of results) {
    if (r.gold_rewarded > 0 && !isBotUser(r.user_id) && !r.user_id.startsWith('guest_')) {
      await supabase.rpc('reward_gold', {
        p_user_id: r.user_id,
        p_amount: r.gold_rewarded,
        p_description: '드래프트 게임 참가 보상',
      })
    }
  }

  await supabase
    .from('draft_rooms')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', roomId)
}
