"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import { Send } from "lucide-react"
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { createAnonClient, createAuthClient } from "@/lib/supabase/client"

import "@/app/games/draft/draft-tokens.css"

interface ChatMessage {
  id: string
  room_id: string
  user_id: string | null
  display_name: string
  kind: string
  body: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

interface ChatPanelProps {
  roomId: string
  myUserId: string | null
  myDisplayName: string | null
  isMember: boolean
}

const MAX_BODY = 200
const MAX_MESSAGES_KEEP = 200

export function ChatPanel({ roomId, myUserId, myDisplayName, isMember }: ChatPanelProps) {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // 초기 메시지 로드 + Realtime 구독
  const loadMessages = useCallback(async () => {
    if (!isMember) return
    try {
      const res = await fetch(`/api/draft-rooms/${roomId}/chat?limit=50`, {
        cache: "no-store",
      })
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
    } catch {
      // ignore
    }
  }, [roomId, isMember])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    const client = myUserId ? createAuthClient(() => getToken()) : createAnonClient()
    supabaseRef.current = client

    const channel = client.channel(`draft:room:${roomId}:chat`)

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "draft_room_messages",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessage
        setMessages((prev) => {
          // 중복 방지
          if (prev.some((m) => m.id === row.id)) return prev
          const next = [...prev, row]
          return next.length > MAX_MESSAGES_KEEP ? next.slice(-MAX_MESSAGES_KEEP) : next
        })
      }
    )

    channel.subscribe()
    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        client.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomId, myUserId, getToken])

  // 새 메시지 도착 시 자동 스크롤
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    if (!isMember) {
      setErrorMsg("방에 참가해야 채팅할 수 있습니다.")
      return
    }
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/draft-rooms/${roomId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data?.error ?? "전송 실패")
        return
      }
      setInput("")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "네트워크 오류")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--draft-card)",
        borderLeft: "1px solid var(--draft-line)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: 14,
          borderBottom: "1px solid var(--draft-line)",
        }}
      >
        <div className="draft-eyebrow draft-eyebrow-burg" style={{ marginBottom: 4 }}>
          채팅
        </div>
        <h3
          style={{
            fontFamily: "var(--draft-font-title)",
            fontWeight: 900,
            fontSize: 16,
            color: "var(--draft-ink)",
          }}
        >
          방 안 대화
        </h3>
      </div>

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: "calc(100vh - 380px)",
        }}
      >
        {messages.length === 0 && (
          <div
            className="draft-serif"
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--draft-mute)",
              fontStyle: "normal",
              fontSize: 13,
            }}
          >
            첫 메시지를 보내보세요.
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} msg={m} isMine={m.user_id === myUserId && m.kind === "chat"} />
        ))}
      </div>

      {errorMsg && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--draft-burgundy-soft)",
            color: "var(--draft-burgundy-deep)",
            fontSize: 11,
          }}
        >
          {errorMsg}
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid var(--draft-line)",
          padding: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={isMember ? "메시지…" : "방 참가 후 채팅"}
          disabled={!isMember || busy}
          maxLength={MAX_BODY}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1.5px solid var(--draft-line)",
            background: "var(--draft-paper)",
            fontSize: 13,
            outline: "none",
            color: "var(--draft-ink)",
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!isMember || busy || !input.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: !isMember || !input.trim() ? "var(--draft-soft)" : "var(--draft-burgundy)",
            color: !isMember || !input.trim() ? "var(--draft-mute)" : "white",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: !isMember || !input.trim() ? "not-allowed" : "pointer",
          }}
          aria-label="메시지 전송"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function MessageRow({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  if (msg.kind !== "chat") {
    return <SystemMessage msg={msg} />
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isMine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--draft-mute)",
          fontFamily: "var(--draft-font-title)",
          fontWeight: 700,
          marginBottom: 2,
          letterSpacing: "0.04em",
        }}
      >
        {msg.display_name}
      </div>
      <div
        style={{
          background: isMine ? "var(--draft-burgundy)" : "var(--draft-soft)",
          color: isMine ? "white" : "var(--draft-ink)",
          padding: "7px 12px",
          borderRadius: 16,
          maxWidth: "80%",
          fontSize: 13,
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {msg.body}
      </div>
    </div>
  )
}

function SystemMessage({ msg }: { msg: ChatMessage }) {
  let text = ""
  if (msg.kind === "system_join") text = `${msg.display_name} 님이 입장했어요.`
  else if (msg.kind === "system_leave") text = `${msg.display_name} 님이 나갔어요.`
  else if (msg.kind === "system_host_change") text = `${msg.display_name} 님이 새 호스트가 됐어요.`
  else if (msg.kind === "system_start") text = `드래프트가 시작됐어요!`
  else if (msg.kind === "system_complete") text = `드래프트가 종료됐어요.`
  else if (msg.kind === "system_pick") {
    const payload = msg.payload as { player_name?: string; is_auto_pick?: boolean }
    text = `${msg.display_name} → ${payload?.player_name ?? "?"}${
      payload?.is_auto_pick ? " (자동)" : ""
    }`
  } else {
    text = msg.kind
  }
  return (
    <div
      className="draft-serif"
      style={{
        fontSize: 11,
        color: "var(--draft-mute)",
        fontStyle: "normal",
        textAlign: "center",
        padding: "4px 0",
      }}
    >
      — {text} —
    </div>
  )
}
