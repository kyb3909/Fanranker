"use client"

import { Clock } from "lucide-react"
import type { Team } from "@/lib/draft/types"

interface DraftOrderProps {
  teams: Team[]
  currentPick: number
  draftOrder: number[]
  timeLeft: number
  timerSeconds: number
}

export function DraftOrder({ teams, currentPick, draftOrder, timeLeft, timerSeconds }: DraftOrderProps) {
  const timerPercentage = (timeLeft / timerSeconds) * 100
  const isUrgent = timeLeft <= 10
  const isCritical = timeLeft <= 5

  return (
    <div className="bg-card border border-border rounded-xl p-3">
      {/* Timer */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">드래프트 순서</span>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${
          isCritical ? "text-rose-500" : isUrgent ? "text-amber-500" : "text-foreground"
        }`}>
          <Clock className={`h-4 w-4 ${isCritical ? "animate-pulse" : ""}`} />
          {timeLeft}초
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isCritical
              ? "bg-rose-500 animate-pulse"
              : isUrgent
                ? "bg-amber-500"
                : "bg-gradient-to-r from-blue-500 to-primary"
          }`}
          style={{ width: `${timerPercentage}%` }}
        />
      </div>

      {/* Pick order */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {draftOrder.map((teamIdx, pickIdx) => {
          const team = teams[teamIdx]
          const isPast = pickIdx < currentPick
          const isCurrent = pickIdx === currentPick

          return (
            <div
              key={pickIdx}
              className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold transition-all ${
                isCurrent
                  ? `bg-gradient-to-br ${team.color} text-white ring-2 ring-primary scale-110`
                  : isPast
                    ? "bg-muted/50 text-muted-foreground/40 line-through"
                    : `bg-gradient-to-br ${team.color} text-white opacity-60`
              }`}
              title={`${pickIdx + 1}번 픽: ${team.name}`}
            >
              {team.name.slice(-1)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
