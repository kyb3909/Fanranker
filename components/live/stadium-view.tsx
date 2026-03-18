"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { type AvatarDirection } from "./pixel-avatar"
import { SpriteAvatar } from "./sprite-avatar"
import { SpeechBubble } from "./speech-bubble"
import type { ChatMessage, Occupant } from "@/hooks/use-live-chat"

const SPORT_BG: Record<string, { gradient: string; fieldColor: string; lineColor: string }> = {
  football: {
    gradient: "from-green-800 via-green-700 to-green-600",
    fieldColor: "#2d8a4e",
    lineColor: "rgba(255,255,255,0.3)",
  },
  baseball: {
    gradient: "from-amber-800 via-amber-700 to-green-700",
    fieldColor: "#8B7355",
    lineColor: "rgba(255,255,255,0.2)",
  },
  basketball: {
    gradient: "from-amber-900 via-orange-800 to-amber-700",
    fieldColor: "#c67b30",
    lineColor: "rgba(255,255,255,0.25)",
  },
  volleyball: {
    gradient: "from-blue-800 via-blue-700 to-indigo-700",
    fieldColor: "#3060a0",
    lineColor: "rgba(255,255,255,0.25)",
  },
}

interface ActiveBubble {
  id: string
  userId: string
  text: string
}

interface MotionState {
  direction: AvatarDirection
  moving: boolean
}

interface StadiumViewProps {
  sport: string
  occupants: Occupant[]
  messages: ChatMessage[]
  homeTeam?: string
  awayTeam?: string
  homeScore?: number | null
  awayScore?: number | null
  myUserId?: string
  onMove?: (x: number, y: number) => void
}

export function StadiumView({
  sport,
  occupants,
  messages,
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  myUserId,
  onMove,
}: StadiumViewProps) {
  const [bubbles, setBubbles] = useState<ActiveBubble[]>([])
  const [motionMap, setMotionMap] = useState<Record<string, MotionState>>({})
  const processedRef = useRef(new Set<string>())
  const containerRef = useRef<HTMLDivElement>(null)
  const prevPositionsRef = useRef(new Map<string, { x: number; y: number }>())
  const stopTimersRef = useRef(new Map<string, number>())

  // 새 메시지 → 말풍선 표시
  useEffect(() => {
    const latestChat = messages.filter((m) => m.type === "chat")
    const latest = latestChat[latestChat.length - 1]
    if (!latest || processedRef.current.has(latest.id)) return

    processedRef.current.add(latest.id)

    // 같은 유저의 이전 말풍선 제거 후 새 말풍선 추가
    setBubbles((prev) => [
      ...prev.filter((b) => b.userId !== latest.userId),
      { id: latest.id, userId: latest.userId, text: latest.text },
    ])
  }, [messages])

  const removeBubble = useCallback((id: string) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const resolveDirection = useCallback((dx: number, dy: number): AvatarDirection => {
    const angle = Math.atan2(dy, dx)
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2)
    const sector = Math.round(normalized / (Math.PI / 4)) % 8
    const directions: AvatarDirection[] = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"]
    return directions[sector]
  }, [])

  useEffect(() => {
    setMotionMap((prev) => {
      const next: Record<string, MotionState> = { ...prev }
      const currentIds = new Set(occupants.map((occ) => occ.userId))

      for (const occ of occupants) {
        const prevPos = prevPositionsRef.current.get(occ.userId)

        if (!next[occ.userId]) {
          next[occ.userId] = { direction: "S", moving: false }
        }

        if (prevPos) {
          const dx = occ.x - prevPos.x
          const dy = occ.y - prevPos.y
          const distance = Math.hypot(dx, dy)

          if (distance > 0.35) {
            const direction = resolveDirection(dx, dy)
            next[occ.userId] = { direction, moving: true }

            const prevTimer = stopTimersRef.current.get(occ.userId)
            if (prevTimer) {
              window.clearTimeout(prevTimer)
            }

            const timer = window.setTimeout(() => {
              setMotionMap((latest) => ({
                ...latest,
                [occ.userId]: {
                  direction: latest[occ.userId]?.direction ?? direction,
                  moving: false,
                },
              }))
            }, 260)

            stopTimersRef.current.set(occ.userId, timer)
          }
        }

        prevPositionsRef.current.set(occ.userId, { x: occ.x, y: occ.y })
      }

      for (const userId of Object.keys(next)) {
        if (!currentIds.has(userId)) {
          delete next[userId]
          prevPositionsRef.current.delete(userId)
          const timer = stopTimersRef.current.get(userId)
          if (timer) {
            window.clearTimeout(timer)
            stopTimersRef.current.delete(userId)
          }
        }
      }

      return next
    })
  }, [occupants, resolveDirection])

  useEffect(() => {
    const timers = stopTimersRef.current

    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  // 클릭/탭으로 이동
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onMove || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      // 필드 영역(상단 27%)은 이동 불가
      if (y < 28) return
      onMove(x, y)
    },
    [onMove]
  )

  const bg = SPORT_BG[sport] || SPORT_BG.football

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-pointer overflow-hidden rounded-xl select-none"
      style={{ paddingBottom: "70%" }}
      onClick={handleClick}
    >
      {/* 배경: 경기장 */}
      <div className={`absolute inset-0 bg-gradient-to-b ${bg.gradient}`}>
        {/* 경기장 필드 */}
        <div
          className="absolute top-[5%] left-[10%] h-[22%] w-[80%] rounded-lg"
          style={{ backgroundColor: bg.fieldColor }}
        >
          {/* 필드 라인 */}
          <div
            className="absolute top-0 left-1/2 h-full w-px"
            style={{ backgroundColor: bg.lineColor }}
          />
          <div
            className="absolute top-1/2 left-1/2 h-[40px] w-[40px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{ borderColor: bg.lineColor }}
          />
          {/* 실시간 점수 */}
          {homeScore != null && awayScore != null && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/50 px-2 py-0.5 text-center">
              <span className="text-xs font-bold text-white tabular-nums">
                {homeScore} : {awayScore}
              </span>
            </div>
          )}
          {/* 팀 이름 */}
          {homeTeam && (
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[10px] font-bold text-white/70">
              {homeTeam}
            </span>
          )}
          {awayTeam && (
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-bold text-white/70">
              {awayTeam}
            </span>
          )}
        </div>

        {/* 관중석 배경 (이동 가능 영역 표시) */}
        <div
          className="absolute left-[2%] w-[96%] rounded-lg"
          style={{
            top: "28%",
            height: "70%",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.25))",
          }}
        />

        {/* 아바타들: 자유 위치 + CSS transition 이동 */}
        {occupants.map((occ) => {
          const bubble = bubbles.find((b) => b.userId === occ.userId)
          const isMe = occ.userId === myUserId
          const motion = motionMap[occ.userId] ?? {
            direction: "S" as AvatarDirection,
            moving: false,
          }

          return (
            <div
              key={occ.userId}
              className="absolute"
              style={{
                left: `${occ.x}%`,
                top: `${occ.y}%`,
                transform: "translate(-50%, -50%)",
                transition: "left 0.4s ease-out, top 0.4s ease-out",
                zIndex: Math.round(occ.y), // 아래쪽이 앞으로
              }}
            >
              <div className="relative flex flex-col items-center">
                {/* 말풍선 */}
                {bubble && (
                  <SpeechBubble
                    key={bubble.id}
                    text={bubble.text}
                    onExpire={() => removeBubble(bubble.id)}
                  />
                )}
                <SpriteAvatar
                  userId={occ.userId}
                  nickname={occ.nickname}
                  size={64}
                  direction={motion.direction}
                  moving={motion.moving}
                />
                {/* 닉네임 + 내 표시 */}
                <span
                  className={`mt-0.5 max-w-[72px] truncate text-center text-[8px] font-bold ${
                    isMe ? "text-yellow-300" : "text-white/70"
                  }`}
                >
                  {occ.nickname}
                </span>
              </div>
            </div>
          )
        })}

        {/* 하단 그라데이션 */}
        <div className="absolute right-0 bottom-0 left-0 h-[10%] bg-gradient-to-t from-black/30 to-transparent" />
      </div>
    </div>
  )
}
