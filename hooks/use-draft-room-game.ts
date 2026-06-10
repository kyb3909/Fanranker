"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { createAnonClient, createAuthClient } from "@/lib/supabase/client"
import type { DraftRoomFullState } from "@/lib/draft/multi-engine"

interface UseDraftRoomGameParams {
  roomId: string
  initialState: DraftRoomFullState
  myUserId: string | null
  myDisplayName: string | null
}

interface DraftRoomGameLive {
  state: DraftRoomFullState
  isConnected: boolean
  /** 클라가 본인 차례 timeout 발견 시 호출 — 서버에서 자동 픽 */
  triggerTimeout: () => Promise<void>
  /** 본인이 직접 픽 */
  pick: (playerId: string) => Promise<{ ok: boolean; error?: string }>
}

export function useDraftRoomGame({
  roomId,
  initialState,
  myUserId,
  myDisplayName,
}: UseDraftRoomGameParams): DraftRoomGameLive {
  const { getToken } = useAuth()
  const [state, setState] = useState<DraftRoomFullState>(initialState)
  const [isConnected, setIsConnected] = useState(false)
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft-rooms/${roomId}/full`, {
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      if (data?.state) setState(data.state)
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

    // 픽 추가/방 상태 변경 → 전체 refresh
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "draft_room_picks",
        filter: `room_id=eq.${roomId}`,
      },
      () => refresh()
    )
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "draft_rooms",
        filter: `id=eq.${roomId}`,
      },
      () => refresh()
    )
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "draft_room_seats",
        filter: `room_id=eq.${roomId}`,
      },
      () => refresh()
    )

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true)
        if (myUserId) {
          await channel.track({
            user_id: myUserId,
            display_name: myDisplayName ?? "익명",
          })
        }
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        setIsConnected(false)
      }
    })

    channelRef.current = channel

    // mount 시 reconnect (이전 disconnected 상태였다면 grace window 안 복귀)
    if (myUserId) {
      fetch(`/api/draft-rooms/${roomId}/reconnect`, { method: "POST" }).catch(() => {
        // ignore
      })
    }

    // unmount / 탭 닫기 / visibility hidden → disconnect
    const sendDisconnect = () => {
      if (!myUserId) return
      // sendBeacon 으로 페이지 닫혀도 전송 (best-effort)
      try {
        navigator.sendBeacon(
          `/api/draft-rooms/${roomId}/disconnect`,
          new Blob([JSON.stringify({})], { type: "application/json" })
        )
      } catch {
        // fallback
        fetch(`/api/draft-rooms/${roomId}/disconnect`, {
          method: "POST",
          keepalive: true,
        }).catch(() => {})
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendDisconnect()
      } else if (document.visibilityState === "visible" && myUserId) {
        fetch(`/api/draft-rooms/${roomId}/reconnect`, { method: "POST" }).catch(() => {})
      }
    }
    window.addEventListener("beforeunload", sendDisconnect)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("beforeunload", sendDisconnect)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      sendDisconnect()
      if (channelRef.current) {
        client.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomId, myUserId, myDisplayName, getToken, refresh])

  const pick = useCallback(
    async (playerId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/draft-rooms/${roomId}/pick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          return { ok: false, error: data?.error ?? "픽 실패" }
        }
        const data = await res.json()
        if (data?.room) setState(data.room)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "네트워크 오류" }
      }
    },
    [roomId]
  )

  const triggerTimeout = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft-rooms/${roomId}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "timeout" }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.room) setState(data.room)
      }
    } catch {
      // ignore
    }
  }, [roomId])

  return { state, isConnected, triggerTimeout, pick }
}
