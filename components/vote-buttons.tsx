"use client"

import { cn } from "@/lib/utils"

interface VoteButtonsProps {
  voteCount: number
  myVote: "up" | "down" | null
  onVote: (type: "up" | "down") => void
  size?: "sm" | "md"
}

export function VoteButtons({ voteCount, myVote, onVote, size = "sm" }: VoteButtonsProps) {
  const isSmall = size === "sm"

  return (
    <div
      className={cn(
        "border-border/60 inline-flex items-center rounded-full border",
        isSmall ? "gap-0.5 px-0.5 py-0.5" : "gap-1 px-1 py-0.5"
      )}
    >
      {/* UP */}
      <button
        className={cn(
          "relative rounded-full font-bold tracking-wide transition-all duration-150 select-none",
          isSmall ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
          myVote === "up"
            ? "bg-primary text-primary-foreground scale-[1.02]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
        )}
        onClick={() => onVote("up")}
        aria-label="추천"
        aria-pressed={myVote === "up"}
      >
        {/* 시각 박스는 유지하되 모바일 터치 영역은 44px 이상 확장 */}
        <span aria-hidden className="absolute -inset-x-1 -inset-y-3 sm:hidden" />
        UP
      </button>

      {/* 숫자 */}
      <span
        key={voteCount}
        className={cn(
          "animate-vote-bump min-w-[1.5rem] text-center font-semibold tabular-nums",
          isSmall ? "text-[11px]" : "text-sm",
          voteCount > 0 && "text-primary",
          voteCount < 0 && "text-blue-500",
          voteCount === 0 && "text-muted-foreground"
        )}
      >
        {voteCount}
      </span>

      {/* DOWN */}
      <button
        className={cn(
          "relative rounded-full font-bold tracking-wide transition-all duration-150 select-none",
          isSmall ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
          myVote === "down"
            ? "scale-[1.02] bg-blue-500 text-white"
            : "text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
        )}
        onClick={() => onVote("down")}
        aria-label="비추천"
        aria-pressed={myVote === "down"}
      >
        <span aria-hidden className="absolute -inset-x-1 -inset-y-3 sm:hidden" />
        DOWN
      </button>
    </div>
  )
}
