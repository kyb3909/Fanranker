"use client"

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import type { Occupant } from "@/hooks/use-stadium-chat"

interface StadiumViewProps {
  level: number
  teamColor: string
  occupants: Occupant[]
  myUserId?: string
  onClickMove?: (x: number, y: number) => void
}

const LEVEL_COLORS: Record<number, { sky: string; field: string; ground: string }> = {
  1: { sky: "#87CEEB", field: "#6B8E23", ground: "#8B7355" },
  2: { sky: "#87CEEB", field: "#558B2F", ground: "#7B8D6A" },
  3: { sky: "#78B4E0", field: "#4CAF50", ground: "#5D7A4A" },
  4: { sky: "#6AABDB", field: "#43A047", ground: "#5D6D3A" },
  5: { sky: "#5C9FD4", field: "#388E3C", ground: "#4E5D32" },
  6: { sky: "#4E93CC", field: "#2E7D32", ground: "#455A30" },
  7: { sky: "#3A7BBF", field: "#1B5E20", ground: "#3D5230" },
  8: { sky: "#2D6DB5", field: "#1B5E20", ground: "#354A28" },
  9: { sky: "#1E5FAB", field: "#0D4F1C", ground: "#2D4220" },
  10: { sky: "#1A237E", field: "#004D40", ground: "#263238" },
}

function Avatar({
  nickname,
  x,
  y,
  isMe,
}: {
  nickname: string
  x: number
  y: number
  isMe: boolean
}) {
  const display = nickname.length > 5 ? nickname.slice(0, 4) + ".." : nickname

  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transition: "left 0.15s linear, top 0.15s linear",
        zIndex: Math.round(y),
      }}
    >
      {/* 닉네임 */}
      <div
        className={cn(
          "mb-0.5 rounded-full px-1.5 py-px text-center text-[12px] font-bold whitespace-nowrap text-white",
          isMe ? "bg-green-600/90" : "bg-black/50"
        )}
      >
        {display}
      </div>

      {/* 아바타 몸체 */}
      <div className="flex flex-col items-center">
        {/* 머리 */}
        <div className="h-4 w-4 rounded-full bg-amber-200">
          <div className="flex items-center justify-center gap-[3px] pt-1">
            <div className="h-[2px] w-[2px] rounded-full bg-gray-800" />
            <div className="h-[2px] w-[2px] rounded-full bg-gray-800" />
          </div>
        </div>
        {/* 몸통 */}
        <div
          className="mt-[-1px] h-4 w-4 rounded-sm"
          style={{ backgroundColor: isMe ? "#4CAF50" : "#64B5F6" }}
        />
        {/* 그림자 */}
        <div className="mt-0.5 h-1 w-4 rounded-full bg-black/20" />
      </div>
    </div>
  )
}

export function StadiumView({
  level,
  teamColor,
  occupants,
  myUserId,
  onClickMove,
}: StadiumViewProps) {
  const colors = LEVEL_COLORS[level] || LEVEL_COLORS[1]

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onClickMove) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      onClickMove(x, y)
    },
    [onClickMove]
  )

  return (
    <div
      className="relative h-full w-full cursor-pointer overflow-hidden select-none"
      onClick={handleClick}
    >
      {/* 하늘 */}
      <div
        className="absolute inset-x-0 top-0 h-[25%]"
        style={{
          background: `linear-gradient(to bottom, ${colors.sky}, ${colors.sky}dd)`,
        }}
      />

      {/* 필드 */}
      <div className="absolute inset-x-0 top-[25%] h-[35%]" style={{ background: colors.field }}>
        {/* 축구장 라인 */}
        <div className="absolute inset-[8%] rounded-sm border border-white/20">
          {/* 센터 라인 */}
          <div className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-white/20" />
          {/* 센터 서클 */}
          <div className="absolute top-1/2 left-1/2 aspect-square h-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        </div>
      </div>

      {/* 관중석 영역 */}
      <div className="absolute inset-x-0 top-[60%] bottom-0" style={{ background: colors.ground }}>
        {/* 좌석 줄 */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-x-0 h-px"
            style={{
              top: `${i * 20}%`,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          />
        ))}
      </div>

      {/* 관중석 (레벨 3+) */}
      {level >= 3 && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: "21%",
            width: `${50 + Math.min(level, 10) * 4}%`,
            height: "4%",
            background: teamColor + "30",
            borderBottom: `2px solid ${teamColor}50`,
          }}
        />
      )}

      {/* 조명탑 (레벨 5+) */}
      {level >= 5 && (
        <>
          <div className="absolute top-[3%] left-[6%] flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-300/80 shadow-[0_0_8px_rgba(255,235,59,0.5)]" />
            <div className="h-[18%] w-px bg-gray-400/60" style={{ height: "50px" }} />
          </div>
          <div className="absolute top-[3%] right-[6%] flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-300/80 shadow-[0_0_8px_rgba(255,235,59,0.5)]" />
            <div className="h-[18%] w-px bg-gray-400/60" style={{ height: "50px" }} />
          </div>
        </>
      )}

      {/* 전광판 (레벨 6+) */}
      {level >= 6 && (
        <div className="absolute top-[2%] left-1/2 -translate-x-1/2 rounded bg-gray-900/80 px-3 py-1">
          <span className="font-mono text-xs font-bold text-green-400">Lv.{level}</span>
        </div>
      )}

      {/* 아바타들 */}
      {occupants.map((occ) => (
        <Avatar
          key={occ.userId}
          nickname={occ.nickname}
          x={occ.x}
          y={occ.y}
          isMe={occ.userId === myUserId}
        />
      ))}
    </div>
  )
}
