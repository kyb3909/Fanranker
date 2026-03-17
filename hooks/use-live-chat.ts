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

interface PresenceState {
  userId: string
  nickname: string
}

const COOLDOWN_MS = 3000
const MAX_LENGTH = 100
const MAX_MESSAGES = 200

export function useLiveChat(roomId: string) {
  // Broadcast/Presence는 인증 불필요 → anon 클라이언트 사용 (세션 변경에 재생성 방지)
  const supabase = useMemo(() => createAnonClient(), [])
  const { user } = useUser()
  const channelRef = useRef<RealtimeChannel | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [lastSentAt, setLastSentAt] = useState(0)

  const nickname = user?.username || user?.firstName || "익명"
  const userId = user?.id

  // 채널 연결
  useEffect(() => {
    if (!roomId || !userId) return

    const channel = supabase.channel(`live-room:${roomId}`, {
      config: { presence: { key: userId } },
    })

    // Presence: 접속자 추적
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState()
      const count = Object.keys(state).length
      setOnlineCount(count)
    })

    channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
      const joined = newPresences[0] as unknown as PresenceState | undefined
      if (joined && joined.userId !== userId) {
        setMessages((prev) =>
          [
            ...prev,
            {
              id: `sys-join-${Date.now()}`,
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

    channel.on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      const left = leftPresences[0] as unknown as PresenceState | undefined
      if (left && left.userId !== userId) {
        setMessages((prev) =>
          [
            ...prev,
            {
              id: `sys-leave-${Date.now()}`,
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
        await channel.track({ userId, nickname })
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

  // 메시지 전송
  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !userId || !channelRef.current) return false

      // 쿨다운 체크
      const now = Date.now()
      if (now - lastSentAt < COOLDOWN_MS) return false

      // 길이 제한
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

      // 자신의 메시지도 로컬에 추가 (broadcast는 자신에게 안 옴)
      setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES))
      setLastSentAt(now)
      return true
    },
    [userId, nickname, lastSentAt]
  )

  const cooldownRemaining = Math.max(0, COOLDOWN_MS - (Date.now() - lastSentAt))

  return {
    messages,
    onlineCount,
    isConnected,
    sendMessage,
    cooldownRemaining,
    maxLength: MAX_LENGTH,
  }
}
