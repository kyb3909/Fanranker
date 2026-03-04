import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError, apiBadRequest } from '@/lib/api-error'
import { getDraftMode } from '@/lib/draft/modes'
import { isBotUser } from '@/lib/draft/auth'
import { autoPickPlayer } from '@/lib/draft/validation'
import type { DraftPick } from '@/lib/draft/types'

/**
 * POST /api/games/draft/rooms/[roomId]/auto-pick — 타임아웃 자동 선택
 * 현재 턴 + 이어지는 봇 턴까지 연쇄 처리
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params

  try {
    const supabase = createServiceRoleClient()

    const { data: room, error: roomErr } = await supabase
      .from('draft_rooms').select('*').eq('id', roomId).single()

    if (roomErr || !room) return apiBadRequest('방을 찾을 수 없습니다.')
    if (room.status !== 'drafting') return apiBadRequest('드래프트가 진행 중이 아닙니다.')

    const mode = getDraftMode(room.game_mode_id)
    if (!mode) return apiBadRequest('게임 모드를 찾을 수 없습니다.')

    const allPlayers = mode.getPlayers()

    const { data: existingPicks } = await supabase
      .from('draft_picks').select('*').eq('room_id', room.id).order('pick_number')

    const { data: participants } = await supabase
      .from('draft_participants').select('*').eq('room_id', room.id)

    const allCurrentPicks = [...(existingPicks || [])]
    const totalPicks = mode.teamCount * mode.picksPerTeam
    const newPicks: DraftPick[] = []

    let currentPick = room.current_pick

    // 현재 턴 자동 픽
    if (currentPick < totalPicks) {
      const currentSeat = room.snake_order[currentPick]
      const autoPlayer = autoPickPlayer(allCurrentPicks, currentSeat, allPlayers, mode)
      if (!autoPlayer) return apiError('선택 가능한 선수가 없습니다.', 500)

      const { data: pick, error: pickErr } = await supabase
        .from('draft_picks')
        .insert({
          room_id: room.id,
          pick_number: currentPick,
          seat_index: currentSeat,
          player_id: autoPlayer.id,
          is_auto_pick: true,
        })
        .select().single()

      if (pickErr) return apiError('자동 선택에 실패했습니다.', 500, pickErr)

      allCurrentPicks.push(pick)
      newPicks.push(pick)
      currentPick++
    }

    // 이어지는 봇 턴 연쇄 처리
    while (currentPick < totalPicks) {
      const nextSeat = room.snake_order[currentPick]
      const nextParticipant = participants?.find(p => p.seat_index === nextSeat)

      if (!nextParticipant || !isBotUser(nextParticipant.user_id)) break

      const botPlayer = autoPickPlayer(allCurrentPicks, nextSeat, allPlayers, mode)
      if (!botPlayer) break

      const { data: botPick, error: botErr } = await supabase
        .from('draft_picks')
        .insert({
          room_id: room.id,
          pick_number: currentPick,
          seat_index: nextSeat,
          player_id: botPlayer.id,
          is_auto_pick: true,
        })
        .select().single()

      if (botErr) break

      allCurrentPicks.push(botPick)
      newPicks.push(botPick)
      currentPick++
    }

    // 게임 완료 체크
    if (currentPick >= totalPicks) {
      await completeGame(supabase, room.id, mode, allPlayers, participants || [])
      return NextResponse.json({ picks: newPicks, completed: true })
    }

    const deadline = new Date(Date.now() + mode.timerSeconds * 1000).toISOString()
    await supabase
      .from('draft_rooms')
      .update({
        current_pick: currentPick,
        pick_deadline_at: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq('id', room.id)

    return NextResponse.json({ picks: newPicks, completed: false, next_pick: currentPick })
  } catch (error) {
    return apiError('자동 선택 중 오류가 발생했습니다.', 500, error)
  }
}

async function completeGame(
  supabase: ReturnType<typeof createServiceRoleClient>,
  roomId: number,
  mode: NonNullable<ReturnType<typeof getDraftMode>>,
  allPlayers: { id: string; cost: number }[],
  participants: { user_id: string; seat_index: number }[]
) {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))

  const { data: picks } = await supabase
    .from('draft_picks').select('*').eq('room_id', roomId)

  if (!picks) return

  const results = participants.map(p => {
    const myPicks = picks.filter(pk => pk.seat_index === p.seat_index)
    const playerIds = myPicks.map(pk => pk.player_id)
    const totalCost = myPicks.reduce((sum, pk) => sum + (playerMap.get(pk.player_id)?.cost || 0), 0)

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
