"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useUser } from "@clerk/nextjs"
import { createAnonClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

export interface ChatMessage {
  id: string
  userId: string
  nickname: string
  text: string
  timestamp: number
  type: "chat" | "system"
}

export interface SeatOccupant {
  userId: string
  nickname: string
  seatIndex: number
}

interface PresencePayload {
  userId: string
  nickname: string
  seatIndex: number
}

const COOLDOWN_MS = 3000
const MAX_LENGTH = 100
const MAX_MESSAGES = 200
const MAX_SEATS = 20

export function useLiveChat(roomId: string) {
  const supabase = useMemo(() => createAnonClient(), [])
  const { user } = useUser()
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [occupants, setOccupants] = useState<SeatOccupant[]>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [lastSentAt, setLastSentAt] = useState(0)
  const mySeatRef = useRef<number>(-1)

  const nickname = user?.username || user?.firstName || "익명"
  const userId = user?.id

  // 빈 좌석 찾기
  function findEmptySeat(currentOccupants: PresencePayload[]): number {
    const taken = new Set(currentOccupants.map((o) => o.seatIndex))
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!taken.has(i)) return i
    }
    return Math.floor(Math.random() * MAX_SEATS)
  }

  useEffect(() => {
    if (!roomId || !userId) return

    const channel = supabase.channel(`live-room:${roomId}`, {
      config: { presence: { key: userId } },
    })

    // Presence sync: 전체 접속자 + 좌석 동기화
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresencePayload>()
      const entries = Object.entries(state)
      setOnlineCount(entries.length)

      const occs: SeatOccupant[] = []
      for (const [, presences] of entries) {
        const p = presences[0]
        if (p) {
          occs.push({
            userId: p.userId,
            nickname: p.nickname,
            seatIndex: p.seatIndex,
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

        // 현재 접속자 기반으로 빈 좌석 배정
        const currentState = channel.presenceState<PresencePayload>()
        const currentOccupants: PresencePayload[] = []
        for (const presences of Object.values(currentState)) {
          if (presences[0]) currentOccupants.push(presences[0])
        }

        const seat = findEmptySeat(currentOccupants)
        mySeatRef.current = seat

        await channel.track({ userId, nickname, seatIndex: seat })
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
      mySeatRef.current = -1
    }
  }, [roomId, userId, nickname, supabase])

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
    cooldownRemaining,
    maxLength: MAX_LENGTH,
  }
}
