"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useUser } from "@clerk/nextjs"
import useSWR from "swr"
import { createAnonClient } from "@/lib/supabase/client"
import { fetcher } from "@/lib/swr"
import type { RealtimeChannel } from "@supabase/supabase-js"

export interface ChatMessage {
  id: string
  userId: string
  nickname: string
  text: string
  timestamp: number
  type: "chat" | "system"
}

export interface Occupant {
  userId: string
  nickname: string
  x: number // 0~100 (%)
  y: number // 0~100 (%)
}

interface PresencePayload {
  userId: string
  nickname: string
  x: number
  y: number
}

const COOLDOWN_MS = 3000
const MAX_LENGTH = 100
const MAX_MESSAGES = 200

// 관중 이동 가능 영역 (% 기준)
const MOVE_AREA = { xMin: 5, xMax: 95, yMin: 30, yMax: 95 }

function randomPosition() {
  return {
    x: MOVE_AREA.xMin + Math.random() * (MOVE_AREA.xMax - MOVE_AREA.xMin),
    y: MOVE_AREA.yMin + Math.random() * (MOVE_AREA.yMax - MOVE_AREA.yMin),
  }
}

export function useLiveChat(roomId: string) {
  const supabase = useMemo(() => createAnonClient(), [])
  const { user } = useUser()
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [occupants, setOccupants] = useState<Occupant[]>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [lastSentAt, setLastSentAt] = useState(0)
  const myPosRef = useRef<{ x: number; y: number }>({ x: 50, y: 60 })

  const { data: profileData } = useSWR(user?.id ? "/api/profile/me" : null, fetcher, {
    revalidateOnFocus: false,
  })
  const nickname = profileData?.nickname || user?.firstName || "익명"
  const userId = user?.id

  useEffect(() => {
    if (!roomId || !userId) return

    const channel = supabase.channel(`live-room:${roomId}`, {
      config: { presence: { key: userId } },
    })

    // Presence sync: 전체 접속자 + 위치 동기화
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresencePayload>()
      const entries = Object.entries(state)
      setOnlineCount(entries.length)

      const occs: Occupant[] = []
      for (const [, presences] of entries) {
        const p = presences[0]
        if (p) {
          occs.push({
            userId: p.userId,
            nickname: p.nickname,
            x: p.x,
            y: p.y,
          })
        }
      }
      setOccupants(occs)
    })

    channel.on("presence", { event: "join" }, ({ newPresences }) => {
      const joined = newPresences[0] as unknown as PresencePayload | undefined
      if (joined && joined.userId !== userId) {
        setMessages((prev) =>
          [
            ...prev,
            {
              id: `sys-join-${Date.now()}-${joined.userId}`,
              userId: "",
              nickname: joined.nickname,
              text: `${joined.nickname}님이 입장했습니다.`,
              timestamp: Date.now(),
              type: "system" as const,
            },
          ].slice(-MAX_MESSAGES)
        )
      }
    })

    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      const left = leftPresences[0] as unknown as PresencePayload | undefined
      if (left && left.userId !== userId) {
        setMessages((prev) =>
          [
            ...prev,
            {
              id: `sys-leave-${Date.now()}-${left.userId}`,
              userId: "",
              nickname: left.nickname,
              text: `${left.nickname}님이 퇴장했습니다.`,
              timestamp: Date.now(),
              type: "system" as const,
            },
          ].slice(-MAX_MESSAGES)
        )
      }
    })

    // Broadcast: 채팅 메시지
    channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      const msg = payload as ChatMessage
      setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES))
    })

    channel.subscribe(async (status, err) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true)

        // 랜덤 위치에서 시작
        const pos = randomPosition()
        myPosRef.current = pos

        await channel.track({ userId, nickname, x: pos.x, y: pos.y })
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[LiveChat] channel error:", status, err)
      }
    })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
      channelRef.current = null
      setIsConnected(false)
    }
  }, [roomId, userId, nickname, supabase])

  // 아바타 이동
  const moveToPosition = useCallback(
    (x: number, y: number) => {
      if (!userId || !channelRef.current) return
      // 이동 영역 제한
      const clampedX = Math.max(MOVE_AREA.xMin, Math.min(MOVE_AREA.xMax, x))
      const clampedY = Math.max(MOVE_AREA.yMin, Math.min(MOVE_AREA.yMax, y))
      myPosRef.current = { x: clampedX, y: clampedY }
      channelRef.current.track({ userId, nickname, x: clampedX, y: clampedY })
    },
    [userId, nickname]
  )

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !userId || !channelRef.current) return false

      const now = Date.now()
      if (now - lastSentAt < COOLDOWN_MS) return false

      const sanitized = trimmed.slice(0, MAX_LENGTH)

      const msg: ChatMessage = {
        id: `msg-${userId}-${now}`,
        userId,
        nickname,
        text: sanitized,
        timestamp: now,
        type: "chat",
      }

      channelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload: msg,
      })

      setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES))
      setLastSentAt(now)
      return true
    },
    [userId, nickname, lastSentAt]
  )

  const cooldownRemaining = Math.max(0, COOLDOWN_MS - (Date.now() - lastSentAt))

  return {
    messages,
    occupants,
    onlineCount,
    isConnected,
    sendMessage,
    moveToPosition,
    cooldownRemaining,
    maxLength: MAX_LENGTH,
  }
}
