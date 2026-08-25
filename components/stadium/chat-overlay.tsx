"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Users } from "lucide-react"
import type { ChatMessage } from "@/hooks/use-stadium-chat"
import { cn } from "@/lib/utils"

interface ChatOverlayProps {
  messages: ChatMessage[]
  onlineCount: number
  isConnected: boolean
  onSend: (text: string) => boolean
  myUserId?: string
}

export function ChatOverlay({
  messages,
  onlineCount,
  isConnected,
  onSend,
  myUserId,
}: ChatOverlayProps) {
  const [input, setInput] = useState("")
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const sent = onSend(input)
    if (sent) setInput("")
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col">
      {/* 접속자 수 뱃지 (우상단) */}
      <div className="pointer-events-auto absolute top-[-36px] right-2">
        <div className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[12px] text-white backdrop-blur-sm">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", isConnected ? "bg-green-400" : "bg-red-400")}
          />
          <Users className="h-3 w-3" />
          <span className="tabular-nums">{onlineCount}</span>
        </div>
      </div>

      {/* 채팅 토글 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="pointer-events-auto mx-auto mb-1 rounded-full bg-black/40 px-3 py-0.5 text-[12px] text-white/70 backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        {expanded ? "채팅 접기" : "채팅 펼치기"}
      </button>

      {/* 채팅 패널 */}
      {expanded && (
        <div className="pointer-events-auto bg-black/40 backdrop-blur-md">
          {/* 메시지 목록 */}
          <div ref={scrollRef} className="max-h-[35vh] space-y-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/40">
                아직 메시지가 없습니다. 첫 인사를 남겨보세요!
              </p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="text-[13px] leading-snug">
                  {msg.type === "system" ? (
                    <span className="text-[12px] text-white/40">{msg.text}</span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "font-semibold",
                          msg.userId === myUserId ? "text-green-300" : "text-blue-300"
                        )}
                      >
                        {msg.nickname}
                      </span>
                      <span className="text-white/90"> {msg.text}</span>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 입력 */}
          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/10 px-3 py-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnected ? "메시지를 입력하세요..." : "연결 중..."}
              disabled={!isConnected}
              maxLength={100}
              className="flex-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15"
            />
            <button
              type="submit"
              disabled={!isConnected || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
