"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { createAnonClient, createAuthClient } from "@/lib/supabase/client"
import type { DraftRoom, DraftRoomSeat, DraftRoomWithSeats } from "@/lib/draft/rooms"

interface UseDraftRoomRealtimeParams {
  roomId: string
  initialRoom: DraftRoomWithSeats
  myUserId: string | null
  myDisplayName: string | null
}

export interface DraftRoomLiveState {
  room: DraftRoom
  seats: DraftRoomSeat[]
  presenceCount: number
  isConnected: boolean
}

/**
 * 대기실/진행 화면용 Realtime 훅.
 *
 * - Postgres Changes 로 draft_rooms / draft_room_seats 변경 시 자동 refresh
 * - Presence 로 현재 채널에 접속 중인 클라이언트 수 추적
 *
 * 채널명: `draft:room:{roomId}` (PRD §7.1 참조)
 */
export function useDraftRoomRealtime({
  roomId,
  initialRoom,
  myUserId,
  myDisplayName,
}: UseDraftRoomRealtimeParams): DraftRoomLiveState {
  const { getToken } = useAuth()
  const [room, setRoom] = useState<DraftRoom>(initialRoom)
  const [seats, setSeats] = useState<DraftRoomSeat[]>(initialRoom.seats)
  const [presenceCount, setPresenceCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // 전체 상태 한 번에 재조회 (DB INSERT/UPDATE/DELETE 다 처리하기 귀찮을 때)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft-rooms/${roomId}`)
      if (!res.ok) return
      const { room: latest } = await res.json()
      if (!latest) return
      setRoom(latest)
      setSeats(latest.seats ?? [])
    } catch {
      // ignore
    }
  }, [roomId])

  useEffect(() => {
    const client = myUserId ? createAuthClient(() => getToken()) : createAnonClient()
    supabaseRef.current = client

    const channel = client.channel(`draft:room:${roomId}`, {
      config: {
        presence: {
          key: myUserId ?? `guest-${Math.random().toString(36).slice(2, 9)}`,
        },
      },
    })

    // Postgres Changes — draft_room_seats
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "draft_room_seats",
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        refresh()
      }
    )

    // Postgres Changes — draft_rooms
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "draft_rooms",
        filter: `id=eq.${roomId}`,
      },
      () => {
        refresh()
      }
    )

    // Presence
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState()
      setPresenceCount(Object.keys(state).length)
    })

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true)
        if (myUserId) {
          await channel.track({
            user_id: myUserId,
            display_name: myDisplayName ?? "익명",
            at: new Date().toISOString(),
          })
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setIsConnected(false)
      } else if (status === "CLOSED") {
        setIsConnected(false)
      }
    })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomId, myUserId, myDisplayName, getToken, refresh])

  return { room, seats, presenceCount, isConnected }
}
