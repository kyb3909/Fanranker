"use client"

import { useParams, useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, Users, Send, Radio } from "lucide-react"
import { useState, useRef, useEffect, useCallback } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { useLiveChat, type ChatMessage } from "@/hooks/use-live-chat"

const SPORT_EMOJI: Record<string, string> = {
  football: "⚽",
  soccer: "⚽",
  baseball: "⚾",
  basketball: "🏀",
  volleyball: "🏐",
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

export default function LiveRoomPage() {
  const params = useParams()
  const router = useRouter()
  const { isSignedIn } = useUser()
  const roomId = params.roomId as string

  const { data, isLoading } = useSWR(`/api/live-rooms/${roomId}`, fetcher, {
    revalidateOnFocus: false,
  })
  const room = data?.room

  const { messages, onlineCount, isConnected, sendMessage, cooldownRemaining, maxLength } =
    useLiveChat(roomId)

  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 새 메시지 시 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    const sent = sendMessage(input)
    if (sent) {
      setInput("")
      inputRef.current?.focus()
    }
  }, [input, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!room) {
    return (
      <main className="mx-auto max-w-[600px] px-4 py-6">
        <Card className="p-8 text-center">
          <Radio className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <h2 className="text-lg font-semibold">채팅방을 찾을 수 없습니다</h2>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/live")}>
            목록으로
          </Button>
        </Card>
      </main>
    )
  }

  const game = room.betman_games
  const emoji = SPORT_EMOJI[room.sport] || SPORT_EMOJI[game?.sport ?? ""] || "🏟️"
  const isRoomClosed = room.status === "closed"

  return (
    <main
      className="mx-auto flex max-w-[600px] flex-col px-4 py-4"
      style={{ height: "calc(100dvh - 100px)" }}
    >
      {/* 상단 바 */}
      <div className="mb-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => router.push("/live")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span>{emoji}</span>
            <h1 className="truncate text-sm font-bold">{room.name}</h1>
            {room.status === "live" && (
              <Badge variant="destructive" className="text-[10px]">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-300" />
                LIVE
              </Badge>
            )}
          </div>
          {game?.league_code && <p className="text-muted-foreground text-xs">{game.league_code}</p>}
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          <Users className="h-3.5 w-3.5" />
          <span>{onlineCount}</span>
        </div>
      </div>

      {/* 경기 정보 */}
      {game && (
        <Card className="mb-3 px-4 py-3">
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="flex-1 truncate text-right font-semibold">{game.home_team_name}</span>
            <span className="text-muted-foreground text-xs">vs</span>
            <span className="flex-1 truncate font-semibold">{game.away_team_name}</span>
          </div>
          {game.match_time && (
            <p className="text-muted-foreground mt-1 text-center text-[11px]">
              {new Date(game.match_time).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </Card>
      )}

      {/* 메시지 영역 */}
      <Card className="mb-3 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {!isSignedIn ? (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                로그인하면 채팅에 참여할 수 있습니다.
              </div>
            ) : !isConnected ? (
              <div className="flex h-full items-center justify-center gap-2">
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                <span className="text-muted-foreground text-sm">연결 중...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                첫 메시지를 보내보세요!
              </div>
            ) : (
              <div className="space-y-1.5">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 입력 영역 */}
      {isSignedIn && !isRoomClosed && (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            placeholder={
              cooldownRemaining > 0
                ? `${Math.ceil(cooldownRemaining / 1000)}초 후 입력 가능`
                : "메시지를 입력하세요..."
            }
            disabled={!isConnected || cooldownRemaining > 0}
            maxLength={maxLength}
            className="flex-1"
            autoComplete="off"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!isConnected || !input.trim() || cooldownRemaining > 0}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isRoomClosed && (
        <p className="text-muted-foreground py-2 text-center text-sm">
          이 채팅방은 종료되었습니다.
        </p>
      )}
    </main>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.type === "system") {
    return <p className="text-muted-foreground text-center text-[11px]">{message.text}</p>
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-primary shrink-0 text-xs font-semibold">{message.nickname}</span>
      <p className="text-foreground text-sm break-all">{message.text}</p>
    </div>
  )
}
