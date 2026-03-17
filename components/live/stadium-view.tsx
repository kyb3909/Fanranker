"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { PixelAvatar } from "./pixel-avatar"
import { SpeechBubble } from "./speech-bubble"
import type { ChatMessage } from "@/hooks/use-live-chat"

// 좌석 배치: 4행 5열 = 20석 (경기장 관중석 느낌)
const SEAT_LAYOUT = (() => {
  const seats: { x: number; y: number }[] = []
  const rows = 4
  const cols = 5
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 곡선 배치 (가운데가 약간 앞으로 나옴)
      const centerOffset = Math.abs(col - 2) * 4
      seats.push({
        x: 10 + col * 20, // % 기준
        y: 30 + row * 17 + centerOffset,
      })
    }
  }
  return seats
})()

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

interface SeatOccupant {
  userId: string
  nickname: string
  seatIndex: number
}

interface ActiveBubble {
  id: string
  userId: string
  text: string
}

interface StadiumViewProps {
  sport: string
  occupants: SeatOccupant[]
  messages: ChatMessage[]
  homeTeam?: string
  awayTeam?: string
}

export function StadiumView({ sport, occupants, messages, homeTeam, awayTeam }: StadiumViewProps) {
  const [bubbles, setBubbles] = useState<ActiveBubble[]>([])
  const processedRef = useRef(new Set<string>())

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

  const bg = SPORT_BG[sport] || SPORT_BG.football

  // occupant → seat mapping
  const seatMap = new Map<number, SeatOccupant>()
  for (const occ of occupants) {
    seatMap.set(occ.seatIndex, occ)
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingBottom: "70%" }}>
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

        {/* 관중석 배경 줄 */}
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="absolute left-[5%] w-[90%] rounded"
            style={{
              top: `${28 + row * 17}%`,
              height: "14%",
              backgroundColor: `rgba(0,0,0,${0.1 + row * 0.05})`,
            }}
          />
        ))}

        {/* 좌석 + 아바타 */}
        {SEAT_LAYOUT.map((seat, idx) => {
          const occupant = seatMap.get(idx)
          const bubble = occupant ? bubbles.find((b) => b.userId === occupant.userId) : null

          return (
            <div
              key={idx}
              className="absolute"
              style={{
                left: `${seat.x}%`,
                top: `${seat.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {occupant ? (
                <div className="relative flex flex-col items-center">
                  {/* 말풍선 */}
                  {bubble && (
                    <SpeechBubble
                      key={bubble.id}
                      text={bubble.text}
                      onExpire={() => removeBubble(bubble.id)}
                    />
                  )}
                  <PixelAvatar userId={occupant.userId} nickname={occupant.nickname} size={40} />
                </div>
              ) : (
                // 빈 좌석
                <div className="flex h-[20px] w-[20px] items-center justify-center rounded-sm bg-gray-600/30">
                  <div className="h-[8px] w-[12px] rounded-t-sm bg-gray-500/40" />
                </div>
              )}
            </div>
          )
        })}

        {/* 관중석 하단 그라데이션 */}
        <div className="absolute right-0 bottom-0 left-0 h-[10%] bg-gradient-to-t from-black/30 to-transparent" />
      </div>
    </div>
  )
}

export { SEAT_LAYOUT }
