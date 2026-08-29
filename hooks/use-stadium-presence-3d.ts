"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createAnonClient } from "@/lib/supabase/client"

/**
 * 3D 구장(/stadium/[teamId]/enter) 의 실시간 동석.
 *
 * 2D 관중석 방(`useStadiumChat`, 채널 `stadium:{teamId}`)과 **채널을 나눈다**.
 * 그쪽 presence 는 x/y 를 화면 백분율로 쓰는데 여기는 월드 좌표라, 한 채널에
 * 섞으면 서로의 아바타를 엉뚱한 자리에 세운다. 채팅을 합칠지는 제품 결정이라
 * 열어 둔다 — 합칠 때는 payload 를 한쪽으로 맞춰야 한다.
 */
export interface Peer3d {
  userId: string
  nickname: string
  /** 월드 좌표 */
  x: number
  z: number
  /** 바라보는 방향(rad) */
  yaw: number
  /** 재생 중인 클립 */
  motion: string
  character: "colin" | "chloe"
  /** 말풍선 — 방금 친 채팅 */
  say?: string
  sayAt?: number
}

export interface Chat3dMessage {
  id: string
  userId: string
  nickname: string
  text: string
  timestamp: number
}

const MAX_MESSAGES = 60
const MAX_LENGTH = 100
const COOLDOWN_MS = 1200
/** 말풍선이 머리 위에 떠 있는 시간 */
export const BUBBLE_MS = 4500

export function useStadiumPresence3d(teamId: string, character: "colin" | "chloe") {
  const { user, isSignedIn } = useUser()
  const [peers, setPeers] = useState<Peer3d[]>([])
  const [messages, setMessages] = useState<Chat3dMessage[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)
  const selfRef = useRef<Peer3d | null>(null)

  const userId = user?.id ?? ""
  const nickname = user?.username ?? user?.firstName ?? "팬"

  useEffect(() => {
    if (!teamId || !isSignedIn || !userId) return
    const supabase = createAnonClient()
    const channel = supabase.channel(`stadium3d:${teamId}`, {
      config: { presence: { key: userId } },
    })

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Peer3d>()
        const next: Peer3d[] = []
        for (const entries of Object.values(state)) {
          const entry = entries[0]
          // 내 아바타는 로컬에서 이미 그리고 있다
          if (entry && entry.userId !== userId) next.push(entry)
        }
        setPeers(next)
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const message = payload as Chat3dMessage
        setMessages((current) => [...current, message].slice(-MAX_MESSAGES))
        // 말풍선은 presence 가 아니라 채팅에서 띄운다 — presence 는 초당 여러 번
        // 갱신되므로 거기에 실으면 남의 말풍선이 깜빡인다
        setPeers((current) =>
          current.map((peer) =>
            peer.userId === message.userId
              ? { ...peer, say: message.text, sayAt: message.timestamp }
              : peer
          )
        )
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return
        setIsConnected(true)
        const initial: Peer3d = {
          userId,
          nickname,
          x: 0,
          z: 0,
          yaw: 0,
          motion: "idle",
          character,
        }
        selfRef.current = initial
        await channel.track(initial)
      })

    channelRef.current = channel
    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
      channelRef.current = null
      setIsConnected(false)
      setPeers([])
    }
  }, [teamId, isSignedIn, userId, nickname, character])

  /** 내 위치를 알린다 — 호출부에서 목만 쳐서 부른다 (기본 8Hz) */
  const publish = useCallback(
    (transform: { x: number; z: number; yaw: number; motion: string }) => {
      const channel = channelRef.current
      if (!channel || !selfRef.current) return
      const next = { ...selfRef.current, ...transform }
      selfRef.current = next
      void channel.track(next)
    },
    []
  )

  const send = useCallback(
    (text: string) => {
      const channel = channelRef.current
      const trimmed = text.trim().slice(0, MAX_LENGTH)
      if (!channel || !trimmed) return false
      const now = Date.now()
      if (now - lastSentRef.current < COOLDOWN_MS) return false
      lastSentRef.current = now
      const message: Chat3dMessage = {
        id: `${userId}-${now}`,
        userId,
        nickname,
        text: trimmed,
        timestamp: now,
      }
      void channel.send({ type: "broadcast", event: "chat", payload: message })
      setMessages((current) => [...current, message].slice(-MAX_MESSAGES))
      return true
    },
    [nickname, userId]
  )

  return {
    peers,
    messages,
    isConnected,
    onlineCount: peers.length + (isConnected ? 1 : 0),
    publish,
    send,
  }
}
