"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, Mail } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import { toast } from "@/hooks/use-toast"

interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  is_read: boolean
  created_at: string
}

interface Conversation {
  partnerId: string
  lastMessage: Message
  unreadCount: number
}

interface Profile {
  user_id: string
  nickname: string
  avatar_url: string | null
}

export default function MessagesPage() {
  const { isSignedIn, userId } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const partnerId = searchParams.get("user")

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [partner, setPartner] = useState<Profile | null>(null)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const profileMap = new Map(profiles.map((p) => [p.user_id, p]))

  // 대화 목록 로드
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/messages")
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations || [])
      setProfiles(data.profiles || [])
    }
    setLoading(false)
  }, [])

  // 특정 대화 로드
  const loadMessages = useCallback(async (pid: string) => {
    const res = await fetch(`/api/messages?partner_id=${pid}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data.messages || [])
      setPartner(data.partner || null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    setLoading(true)
    if (partnerId) {
      loadMessages(partnerId)
    } else {
      loadConversations()
    }
  }, [isSignedIn, partnerId, loadConversations, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!text.trim() || sending || !partnerId) return
    setSending(true)
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_id: partnerId, content: text.trim() }),
      })
      if (res.ok) {
        const { message } = await res.json()
        setMessages((prev) => [...prev, message])
        setText("")
      } else {
        const err = await res.json()
        toast({ variant: "destructive", title: "오류", description: err.error || "전송 실패" })
      }
    } catch {
      toast({ variant: "destructive", title: "오류", description: "전송 중 오류가 발생했습니다." })
    } finally {
      setSending(false)
    }
  }

  if (!isSignedIn) {
    return (
      <main className="container mx-auto max-w-[600px] px-4 py-20 text-center">
        <p className="text-muted-foreground">로그인이 필요합니다.</p>
      </main>
    )
  }

  // 대화 상세
  if (partnerId) {
    return (
      <main className="container mx-auto max-w-[600px] px-4 py-6">
        <div className="bg-card border-border overflow-hidden rounded-lg border">
          {/* 헤더 */}
          <div className="border-border flex items-center gap-3 border-b px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => router.push("/messages")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarImage src={partner?.avatar_url || undefined} />
              <AvatarFallback>{partner?.nickname?.[0] || "?"}</AvatarFallback>
            </Avatar>
            <span className="text-foreground text-sm font-semibold">
              {partner?.nickname || "..."}
            </span>
          </div>

          {/* 메시지 목록 */}
          <div className="h-[60vh] space-y-3 overflow-y-auto p-4">
            {loading ? (
              <p className="text-muted-foreground py-8 text-center text-sm">로딩 중...</p>
            ) : messages.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                첫 메시지를 보내보세요!
              </p>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === userId
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={`mt-1 text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                      >
                        {formatRelativeTime(new Date(msg.created_at))}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 */}
          <div className="border-border flex gap-2 border-t p-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="메시지를 입력하세요..."
              className="max-h-[120px] min-h-[40px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              size="sm"
              className="shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    )
  }

  // 대화 목록
  return (
    <main className="container mx-auto max-w-[600px] px-4 py-6">
      <h1 className="text-foreground mb-4 text-xl font-bold">쪽지함</h1>
      <div className="bg-card border-border overflow-hidden rounded-lg border">
        {loading ? (
          <p className="text-muted-foreground py-12 text-center text-sm">로딩 중...</p>
        ) : conversations.length === 0 ? (
          <div className="py-12 text-center">
            <Mail className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">주고받은 쪽지가 없습니다.</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const p = profileMap.get(conv.partnerId)
            const isMine = conv.lastMessage.sender_id === userId
            return (
              <button
                key={conv.partnerId}
                onClick={() => router.push(`/messages?user=${conv.partnerId}`)}
                className="border-border/50 hover:bg-muted/50 flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-0"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={p?.avatar_url || undefined} />
                  <AvatarFallback>{p?.nickname?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground text-sm font-semibold">
                      {p?.nickname || "알 수 없음"}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {formatRelativeTime(new Date(conv.lastMessage.created_at))}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {isMine ? "나: " : ""}
                    {conv.lastMessage.content}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </main>
  )
}
