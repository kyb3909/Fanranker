"use client"

import { cn } from "@/lib/utils"

export type { TitleDisplay } from "@/types/user"
import type { TitleDisplay } from "@/types/user"

interface TitleBadgeProps extends TitleDisplay {
  className?: string
  size?: "sm" | "md"
}

const RARITY_STYLES = {
  common: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  rare: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
  epic: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300",
  legendary:
    "bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 dark:from-amber-950/60 dark:to-yellow-950/60 dark:text-amber-300",
} as const

/**
 * 칭호 뱃지 컴포넌트
 * 형용사 + 명사 조합을 인라인 뱃지로 표시
 * 예: 축잘알 꾸레
 */
export function TitleBadge({
  adjTitle,
  nounTitle,
  rarity = "common",
  className,
  size = "sm",
}: TitleBadgeProps) {
  if (!adjTitle && !nounTitle) return null

  const displayText = [adjTitle, nounTitle].filter(Boolean).join(" ")
  const rarityKey = rarity || "common"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm leading-tight font-medium",
        size === "sm" ? "px-1.5 py-[1px] text-[12px]" : "px-2 py-0.5 text-xs",
        RARITY_STYLES[rarityKey],
        className
      )}
    >
      {displayText}
    </span>
  )
}
