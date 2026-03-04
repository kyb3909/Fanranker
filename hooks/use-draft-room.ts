'use client'

import { useEffect, useReducer, useCallback, useRef } from 'react'
import { useSupabaseAnon } from '@/lib/supabase/hooks'
import { draftPost, draftGet } from '@/lib/draft/api'
import type {
  DraftRoom,
  RoomParticipant,
  DraftPick,
  DraftPlayer,
  DraftGameState,
  DraftBroadcastEvent,
  GameModeConfig,
} from '@/lib/draft/types'
import { calculateSpent, getPositionCounts } from '@/lib/draft/validation'

// ============================
// Reducer
// ============================
type Action =
  | { type: 'INIT'; room: DraftRoom; participants: RoomParticipant[]; picks: DraftPick[]; userId: string; allPlayers: DraftPlayer[]; config: GameModeConfig }
  | { type: 'PLAYER_JOINED'; participant: RoomParticipant }
  | { type: 'PLAYER_LEFT'; user_id: string }
  | { type: 'PLAYER_READY'; user_id: string; is_ready: boolean }
  | { type: 'GAME_STARTED'; room: DraftRoom }
  | { type: 'PICK_MADE'; pick: DraftPick; next_pick: number; pick_deadline_at: string }
  | { type: 'PICKS_BATCH'; picks: DraftPick[]; next_pick: number; pick_deadline_at: string }
  | { type: 'GAME_COMPLETED'; room: DraftRoom }
  | { type: 'SET_LOADING'; loading: boolean }

interface InternalState extends DraftGameState {
  _allPlayers: DraftPlayer[]
  _config: GameModeConfig | null
  _userId: string | null
}

function computeDerived(
  state: InternalState,
  allPlayers: DraftPlayer[],
  config: GameModeConfig | null,
  userId: string | null,
): Partial<DraftGameState> {
  if (!config || !state.room) return {}

  const pickedIds = new Set(state.picks.map(p => p.player_id))
  const availablePlayers = allPlayers.filter(p => !pickedIds.has(p.id))

  const mySeatIndex = state.participants.find(p => p.user_id === userId)?.seat_index ?? null

  const myPicks = mySeatIndex !== null
    ? state.picks.filter(p => p.seat_index === mySeatIndex)
    : []

  const budgets: Record<number, number> = {}
  const positionCounts: Record<number, Record<string, number>> = {}
  for (let s = 0; s < config.teamCount; s++) {
    budgets[s] = config.salaryCap - calculateSpent(state.picks, s, allPlayers)
    positionCounts[s] = getPositionCounts(state.picks, s, allPlayers)
  }

  const currentSeat = state.room.snake_order?.[state.room.current_pick]
  const isMyTurn = mySeatIndex !== null && currentSeat === mySeatIndex && state.room.status === 'drafting'

  return { availablePlayers, myPicks, mySeatIndex, budgets, positionCounts, isMyTurn }
}

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case 'INIT': {
      const base: InternalState = {
        ...state,
        room: action.room,
        participants: action.participants,
        picks: action.picks,
        isLoading: false,
        _allPlayers: action.allPlayers,
        _config: action.config,
        _userId: action.userId,
        availablePlayers: [],
        myPicks: [],
        mySeatIndex: null,
        budgets: {},
        positionCounts: {},
        isMyTurn: false,
      }
      return { ...base, ...computeDerived(base, action.allPlayers, action.config, action.userId) }
    }

    case 'PLAYER_JOINED': {
      const participants = [...state.participants.filter(p => p.user_id !== action.participant.user_id), action.participant]
        .sort((a, b) => a.seat_index - b.seat_index)
      return { ...state, participants }
    }

    case 'PLAYER_LEFT': {
      const participants = state.participants.filter(p => p.user_id !== action.user_id)
      return { ...state, participants }
    }

    case 'PLAYER_READY': {
      const participants = state.participants.map(p =>
        p.user_id === action.user_id ? { ...p, is_ready: action.is_ready } : p
      )
      return { ...state, participants }
    }

    case 'GAME_STARTED': {
      const next = { ...state, room: action.room }
      return { ...next, ...computeDerived(next, state._allPlayers, state._config, state._userId) }
    }

    case 'PICK_MADE': {
      const picks = [...state.picks, action.pick]
      const room = state.room ? {
        ...state.room,
        current_pick: action.next_pick,
        pick_deadline_at: action.pick_deadline_at,
      } : state.room
      const next = { ...state, picks, room }
      return { ...next, ...computeDerived(next, state._allPlayers, state._config, state._userId) }
    }

    case 'PICKS_BATCH': {
      const picks = [...state.picks, ...action.picks]
      const room = state.room ? {
        ...state.room,
        current_pick: action.next_pick,
        pick_deadline_at: action.pick_deadline_at,
      } : state.room
      const next = { ...state, picks, room }
      return { ...next, ...computeDerived(next, state._allPlayers, state._config, state._userId) }
    }

    case 'GAME_COMPLETED': {
      const next = { ...state, room: action.room }
      return { ...next, ...computeDerived(next, state._allPlayers, state._config, state._userId) }
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading }

    default:
      return state
  }
}

const initialState: InternalState = {
  room: null,
  participants: [],
  picks: [],
  myPicks: [],
  mySeatIndex: null,
  availablePlayers: [],
  budgets: {},
  positionCounts: {},
  isMyTurn: false,
  isLoading: true,
  _allPlayers: [],
  _config: null,
  _userId: null,
}

// ============================
// Hook
// ============================
export function useDraftRoom(roomId: number, config: GameModeConfig | null, userId: string | null) {
  const supabase = useSupabaseAnon()
  const [state, dispatch] = useReducer(reducer, initialState)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // 초기 데이터 로딩
  const loadRoom = useCallback(async () => {
    if (!config || !userId) return

    dispatch({ type: 'SET_LOADING', loading: true })

    try {
      const res = await draftGet(`/api/games/draft/rooms/${roomId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      dispatch({
        type: 'INIT',
        room: data.room,
        participants: data.participants,
        picks: data.picks,
        userId,
        allPlayers: config.getPlayers(),
        config,
      })
    } catch {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }, [roomId, config, userId])

  // Realtime 구독
  useEffect(() => {
    if (!userId || !config) return

    loadRoom()

    const channel = supabase.channel(`draft:room:${roomId}`)

    channel
      .on('broadcast', { event: 'draft_event' }, ({ payload }) => {
        const event = payload as DraftBroadcastEvent
        switch (event.type) {
          case 'player_joined':
            dispatch({ type: 'PLAYER_JOINED', participant: event.participant })
            break
          case 'player_left':
            dispatch({ type: 'PLAYER_LEFT', user_id: event.user_id })
            break
          case 'player_ready':
            dispatch({ type: 'PLAYER_READY', user_id: event.user_id, is_ready: event.is_ready })
            break
          case 'game_started':
            dispatch({ type: 'GAME_STARTED', room: event.room })
            break
          case 'pick_made':
            dispatch({
              type: 'PICK_MADE',
              pick: event.pick,
              next_pick: event.next_pick,
              pick_deadline_at: event.pick_deadline_at,
            })
            break
          case 'game_completed':
            loadRoom()
            break
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [supabase, roomId, userId, config, loadRoom])

  const broadcast = useCallback((event: DraftBroadcastEvent) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'draft_event',
      payload: event,
    })
  }, [])

  // ============================
  // 액션
  // ============================
  const makePick = useCallback(async (playerId: string) => {
    const res = await draftPost(`/api/games/draft/rooms/${roomId}/pick`, { playerId })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    // 내 픽 broadcast
    broadcast({
      type: 'pick_made',
      pick: data.pick,
      next_pick: data.room?.current_pick ?? state.room?.current_pick ?? 0,
      pick_deadline_at: data.room?.pick_deadline_at ?? '',
    })

    // 봇 연쇄 픽도 반영
    if (data.botPicks?.length > 0) {
      for (const bp of data.botPicks) {
        broadcast({
          type: 'pick_made',
          pick: bp,
          next_pick: data.room?.current_pick ?? 0,
          pick_deadline_at: data.room?.pick_deadline_at ?? '',
        })
      }
    }

    if (data.completed) {
      broadcast({ type: 'game_completed', results: [] })
      loadRoom()
    } else {
      // 로컬 상태 업데이트: 내 픽 + 봇 픽 한번에
      const allNewPicks = [data.pick, ...(data.botPicks || [])]
      dispatch({
        type: 'PICKS_BATCH',
        picks: allNewPicks,
        next_pick: data.room?.current_pick ?? 0,
        pick_deadline_at: data.room?.pick_deadline_at ?? '',
      })
    }

    return data
  }, [roomId, broadcast, loadRoom, state.room])

  const toggleReady = useCallback(async () => {
    const res = await draftPost(`/api/games/draft/rooms/${roomId}/ready`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    if (userId) {
      broadcast({ type: 'player_ready', user_id: userId, is_ready: data.is_ready })
    }
    return data
  }, [roomId, broadcast, userId])

  const startGame = useCallback(async () => {
    const res = await draftPost(`/api/games/draft/rooms/${roomId}/start`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    broadcast({ type: 'game_started', room: data.room, snake_order: data.room.snake_order })
    dispatch({ type: 'GAME_STARTED', room: data.room })

    return data
  }, [roomId, broadcast])

  const leaveRoom = useCallback(async () => {
    const res = await draftPost(`/api/games/draft/rooms/${roomId}/leave`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    if (userId) {
      broadcast({ type: 'player_left', user_id: userId, seat_index: state.mySeatIndex ?? 0 })
    }
    return data
  }, [roomId, broadcast, userId, state.mySeatIndex])

  const triggerAutoPick = useCallback(async () => {
    const res = await draftPost(`/api/games/draft/rooms/${roomId}/auto-pick`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    if (data.completed) {
      loadRoom()
    } else {
      loadRoom() // 자동픽 후 전체 새로고침이 가장 안전
    }
    return data
  }, [roomId, loadRoom])

  const fillBots = useCallback(async () => {
    // 이미 drafting 상태면 무시
    if (state.room?.status !== 'waiting') return

    const res = await draftPost(`/api/games/draft/rooms/${roomId}/bot-fill`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    // 봇 추가 후 전체 새로고침
    loadRoom()
    return data
  }, [roomId, loadRoom, state.room?.status])

  return {
    room: state.room,
    participants: state.participants,
    picks: state.picks,
    myPicks: state.myPicks,
    mySeatIndex: state.mySeatIndex,
    availablePlayers: state.availablePlayers,
    budgets: state.budgets,
    positionCounts: state.positionCounts,
    isMyTurn: state.isMyTurn,
    isLoading: state.isLoading,

    makePick,
    toggleReady,
    startGame,
    leaveRoom,
    triggerAutoPick,
    fillBots,
    reload: loadRoom,
  }
}
