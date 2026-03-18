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
import { StadiumView } from "@/components/live/stadium-view"

const SPORT_MAP: Record<string, string> = {
  football: "football",
  soccer: "football",
  baseball: "baseball",
  basketball: "basketball",
  volleyball: "volleyball",
  축구: "football",
  야구: "baseball",
  농구: "basketball",
  배구: "volleyball",
}

export default function LiveRoomPage() {
  const params = useParams()
  const router = useRouter()
  const { isSignedIn, user } = useUser()
  const roomId = params.roomId as string

  const {
    data,
    isLoading,
    mutate: mutateRoom,
  } = useSWR(`/api/live-rooms/${roomId}`, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (latestData: { room?: { status?: string } } | undefined) => {
      const status = latestData?.room?.status
      // live/waiting 상태: 30초마다 갱신, ended: 60초
      if (status === "live" || status === "waiting") return 30_000
      if (status === "ended") return 60_000
      return 0
    },
  })
  const room = data?.room

  // WiseToto 30초 폴링: live/waiting 상태일 때 점수 동기화 트리거
  useSWR(
    room?.status === "live" || room?.status === "waiting" ? "/api/wisetoto/sync" : null,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
      onSuccess: () => {
        // 점수 동기화 후 룸 데이터 갱신
        mutateRoom()
      },
    }
  )

  const {
    messages,
    occupants,
    onlineCount,
    isConnected,
    sendMessage,
    moveToPosition,
    moveByKeyboard,
    cooldownRemaining,
    maxLength,
  } = useLiveChat(roomId)

  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!isSignedIn || !isConnected || isLoading || room?.status === "closed") return

    const pressed = new Set<string>()
    let intervalId: number | null = null

    const getMoveKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()

      if (event.code === "KeyW") return "up"
      if (event.code === "KeyA") return "left"
      if (event.code === "KeyS") return "down"
      if (event.code === "KeyD") return "right"
      if (key === "arrowup") return "up"
      if (key === "arrowleft") return "left"
      if (key === "arrowdown") return "down"
      if (key === "arrowright") return "right"

      return null
    }

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
    }

    const getVector = () => {
      const left = pressed.has("left")
      const right = pressed.has("right")
      const up = pressed.has("up")
      const down = pressed.has("down")

      let dx = 0
      let dy = 0

      if (left) dx -= 1
      if (right) dx += 1
      if (up) dy -= 1
      if (down) dy += 1

      if (dx !== 0 && dy !== 0) {
        const normalized = Math.SQRT1_2
        dx *= normalized
        dy *= normalized
      }

      return { dx, dy }
    }

    const tick = () => {
      const { dx, dy } = getVector()
      if (dx === 0 && dy === 0) return
      moveByKeyboard(dx, dy)
    }

    const ensureLoop = () => {
      if (intervalId !== null) return
      intervalId = window.setInterval(tick, 80)
    }

    const clearLoop = () => {
      if (intervalId === null) return
      window.clearInterval(intervalId)
      intervalId = null
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      const moveKey = getMoveKey(event)
      if (!moveKey) {
        return
      }

      event.preventDefault()
      pressed.add(moveKey)
      tick()
      ensureLoop()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const moveKey = getMoveKey(event)
      if (!moveKey) return
      pressed.delete(moveKey)
      if (pressed.size === 0) {
        clearLoop()
      }
    }

    const handleBlur = () => {
      pressed.clear()
      clearLoop()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
      clearLoop()
    }
  }, [isConnected, isLoading, isSignedIn, moveByKeyboard, room?.status])

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
  const sportKey = SPORT_MAP[room.sport] || SPORT_MAP[game?.sport ?? ""] || "football"
  const isRoomClosed = room.status === "closed"

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-4">
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

      {/* 메인: 경기장 + 채팅 패널 */}
      <div className="flex flex-col gap-3 lg:flex-row">
        {/* 경기장 뷰 */}
        <div className="lg:flex-1">
          <StadiumView
            sport={sportKey}
            occupants={occupants}
            messages={messages}
            homeTeam={game?.home_team_name}
            awayTeam={game?.away_team_name}
            homeScore={game?.home_score}
            awayScore={game?.away_score}
            myUserId={user?.id}
            onMove={moveToPosition}
          />
          <p className="text-muted-foreground mt-2 text-center text-xs">
            <code>WASD</code> 또는 방향키로 이동할 수 있습니다.
          </p>
          {/* 경기 정보 */}
          {game && (
            <Card className="mt-2 px-4 py-2">
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="flex-1 truncate text-right font-semibold">
                  {game.home_team_name}
                </span>
                {game.home_score != null && game.away_score != null ? (
                  <span className="flex items-center gap-1.5 font-bold tabular-nums">
                    <span className="text-base">{game.home_score}</span>
                    <span className="text-muted-foreground text-xs">:</span>
                    <span className="text-base">{game.away_score}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">vs</span>
                )}
                <span className="flex-1 truncate font-semibold">{game.away_team_name}</span>
              </div>
              {game.match_time && (
                <p className="text-muted-foreground mt-0.5 text-center text-[11px]">
                  {new Date(game.match_time).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {game.home_score != null && game.status === "in_progress" && (
                    <span className="ml-1.5 text-red-500">● LIVE</span>
                  )}
                </p>
              )}
            </Card>
          )}
        </div>

        {/* 채팅 패널 */}
        <div className="flex h-[400px] flex-col lg:h-auto lg:w-[320px]">
          <Card className="flex flex-1 flex-col overflow-hidden">
            <div className="border-border flex items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-semibold">채팅</span>
              <span className="text-muted-foreground text-[10px]">{messages.length}개 메시지</span>
            </div>
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
                <div className="space-y-1">
                  {messages.map((msg) => (
                    <MessageLine key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </Card>

          {/* 입력 */}
          {isSignedIn && !isRoomClosed && (
            <div className="mt-2 flex items-center gap-2">
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
        </div>
      </div>
    </main>
  )
}

function MessageLine({ message }: { message: ChatMessage }) {
  if (message.type === "system") {
    return <p className="text-muted-foreground text-center text-[10px]">{message.text}</p>
  }

  return (
    <div className="flex gap-1.5 text-xs">
      <span className="text-primary shrink-0 font-bold">{message.nickname}</span>
      <span className="text-foreground break-all">{message.text}</span>
    </div>
  )
}
