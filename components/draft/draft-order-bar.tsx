'use client'

import { SEAT_COLORS } from '@/lib/draft/utils'

interface DraftOrderBarProps {
  snakeOrder: number[]
  currentPick: number
  totalPicks: number
}

export function DraftOrderBar({ snakeOrder, currentPick, totalPicks }: DraftOrderBarProps) {
  // 현재 픽 주변 ±3개만 표시
  const start = Math.max(0, currentPick - 2)
  const end = Math.min(totalPicks, currentPick + 6)
  const visible = snakeOrder.slice(start, end)

  return (
    <div className="flex items-center gap-1 overflow-hidden">
      {start > 0 && <span className="text-xs text-muted-foreground">...</span>}
      {visible.map((seatIndex, i) => {
        const pickNum = start + i
        const isCurrent = pickNum === currentPick
        const isPast = pickNum < currentPick
        const color = SEAT_COLORS[seatIndex]

        return (
          <div
            key={pickNum}
            className={`flex items-center justify-center rounded-md text-[10px] font-bold transition-all ${
              isCurrent
                ? `${color.bg} text-white w-8 h-8 ring-2 ring-offset-1 ${color.ring} scale-110`
                : isPast
                  ? 'bg-muted/50 text-muted-foreground/50 w-6 h-6'
                  : `${color.light} ${color.text} w-6 h-6`
            }`}
            title={`Pick #${pickNum + 1} - ${color.name}`}
          >
            {pickNum + 1}
          </div>
        )
      })}
      {end < totalPicks && <span className="text-xs text-muted-foreground">...</span>}
    </div>
  )
}
