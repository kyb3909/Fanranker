"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Send, Loader2, MessageSquare } from "lucide-react"

interface Message {
  id: string
  sender_id: string
  message_type: string
  content: string
  attachments: string[]
  is_read: boolean
  created_at: string
}

interface Props {
  orderId: string
  currentUserId: string
  profiles: Record<string, { nickname: string; avatar_url: string | null }>
}

export function CommissionChat({ orderId, currentUserId, profiles }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/commissions/orders/${orderId}/messages`)
      const data = await res.json()
      if (res.ok) setMessages(data.messages)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [fetchMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/commissions/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() }),
      })
      if (res.ok) {
        setInput('')
        await fetchMessages()
      }
    } catch {
      // silently fail
    } finally {
      setSending(false)
    }
  }

  const getAvatar = (senderId: string) => {
    if (senderId === 'system') return 'S'
    const profile = profiles[senderId]
    return profile?.nickname?.[0]?.toUpperCase() || '?'
  }

  const getName = (senderId: string) => {
    if (senderId === 'system') return '시스템'
    return profiles[senderId]?.nickname || '사용자'
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col" style={{ height: '400px' }}>
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-bold text-sm text-foreground">메시지</h3>
        <span className="text-xs text-muted-foreground">({messages.length})</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">아직 메시지가 없습니다.</p>
        ) : (
          messages.map((msg) => {
            const isSystem = msg.message_type === 'system'
            const isMine = msg.sender_id === currentUserId

            if (isSystem) {
              return (
                <div key={msg.id} className="text-center">
                  <span className="text-[11px] text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                    {msg.content}
                  </span>
                </div>
              )
            }

            return (
              <div key={msg.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold shrink-0">
                  {getAvatar(msg.sender_id)}
                </div>
                <div className={`max-w-[70%] ${isMine ? 'text-right' : ''}`}>
                  <p className="text-[11px] text-muted-foreground mb-0.5">{getName(msg.sender_id)}</p>
                  <div className={`rounded-lg px-3 py-2 text-sm ${
                    isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 flex gap-2">
        <input
          className="flex-1 h-9 px-3 bg-secondary text-sm text-foreground rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          placeholder="메시지를 입력하세요..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
        />
        <Button size="sm" className="h-9 px-3" onClick={sendMessage} disabled={!input.trim() || sending}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}
