"use client"

import { cn } from "@/lib/utils"

interface ConstructionGaugeProps {
  level: number
  levelName: string
  totalPoints: number
  currentRequired: number
  nextLevelPoints: number | null
  progressPct: number
  color?: string
}

export function ConstructionGauge({
  level,
  levelName,
  totalPoints,
  currentRequired,
  nextLevelPoints,
  progressPct,
  color,
}: ConstructionGaugeProps) {
  const isMaxLevel = !nextLevelPoints

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-primary/15 text-primary rounded-md px-2 py-0.5 text-xs font-bold">
            Lv.{level}
          </span>
          <span className="text-sm font-semibold">{levelName}</span>
        </div>
        {!isMaxLevel && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {totalPoints.toLocaleString()} / {nextLevelPoints.toLocaleString()} pt
          </span>
        )}
      </div>

      {/* 게이지 바 */}
      <div className="bg-muted relative h-4 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            isMaxLevel && "bg-gradient-to-r from-amber-400 to-amber-500"
          )}
          style={{
            width: `${progressPct}%`,
            backgroundColor: !isMaxLevel ? color || "hsl(var(--primary))" : undefined,
          }}
        />
        {/* 퍼센트 텍스트 */}
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-sm">
          {isMaxLevel ? "MAX" : `${progressPct}%`}
        </span>
      </div>

      {!isMaxLevel && (
        <p className="text-muted-foreground text-[11px]">
          다음 레벨까지{" "}
          <span className="text-foreground font-medium">
            {(nextLevelPoints - totalPoints).toLocaleString()} pt
          </span>{" "}
          남음
        </p>
      )}
    </div>
  )
}
