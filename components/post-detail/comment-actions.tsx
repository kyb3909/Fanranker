"use client"

import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, MessageCircle, Flag } from "lucide-react"

export interface CommentActionsProps {
  depth: number
  maxDepth: number
  voteCount: number
  myVote: "up" | "down" | null
  isReplying: boolean
  isOwner: boolean
  currentUserId?: string | null
  onVote: (type: "up" | "down") => void
  onToggleReply: () => void
  onReport: () => void
}

export function CommentActions({
  depth,
  maxDepth,
  voteCount,
  myVote,
  isReplying,
  isOwner,
  currentUserId,
  onVote,
  onToggleReply,
  onReport,
}: CommentActionsProps) {
  const iconSize = depth === 0 ? "h-4 w-4" : "h-3 w-3"

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 gap-0.5 px-1.5 ${myVote === "up" ? "text-primary" : "text-muted-foreground"}`}
        onClick={() => onVote("up")}
        aria-label="추천"
      >
        <ArrowUp className={iconSize} />
      </Button>
      <span
        className={`min-w-[1.5rem] text-center text-sm font-medium ${voteCount > 0 ? "text-primary" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}
      >
        {voteCount}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 gap-0.5 px-1.5 ${myVote === "down" ? "text-destructive" : "text-muted-foreground"}`}
        onClick={() => onVote("down")}
        aria-label="비추천"
      >
        <ArrowDown className={iconSize} />
      </Button>

      {depth < maxDepth && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground ml-1 h-7 gap-1"
          onClick={onToggleReply}
        >
          <MessageCircle className={iconSize} />
          <span className="text-xs">답글</span>
        </Button>
      )}

      {!isOwner && currentUserId && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground ml-auto h-7 gap-1"
          onClick={onReport}
          title="신고하기"
          aria-label="신고하기"
        >
          <Flag className={iconSize} />
        </Button>
      )}
    </div>
  )
}
