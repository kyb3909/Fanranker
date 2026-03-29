"use client"

import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, MessageCircle, Bookmark, Flame } from "lucide-react"
import Link from "next/link"
import { ShareMenu } from "@/components/share-menu"

function getTemperatureColor(temp: number) {
  if (temp >= 80) return "text-red-500"
  if (temp >= 60) return "text-orange-500"
  if (temp >= 40) return "text-amber-500"
  if (temp >= 20) return "text-blue-500"
  return "text-slate-400"
}

export interface PostCardFooterProps {
  postId: number | string
  postTitle: string
  voteCount: number
  myVote: "up" | "down" | null
  comments: number
  temperature?: number
  isBookmarked: boolean
  onVote: (type: "up" | "down") => void
  onBookmark: () => void
  onBookmarkHover: () => void
}

export function PostCardFooter({
  postId,
  postTitle,
  voteCount,
  myVote,
  comments,
  temperature,
  isBookmarked,
  onVote,
  onBookmark,
  onBookmarkHover,
}: PostCardFooterProps) {
  return (
    <div className="mt-3 flex items-center gap-1">
      {/* 투표 */}
      <div className="border-border/50 flex items-center rounded-full border">
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 min-h-[36px] rounded-l-full rounded-r-none px-2.5 ${myVote === "up" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => onVote("up")}
          aria-label="추천"
          aria-pressed={myVote === "up"}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <span
          className={`min-w-[24px] text-center text-[12px] font-semibold tabular-nums ${voteCount > 0 ? "text-primary" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {voteCount}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 min-h-[36px] rounded-l-none rounded-r-full px-2.5 ${myVote === "down" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => onVote("down")}
          aria-label="비추천"
          aria-pressed={myVote === "down"}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>

      {/* 댓글 */}
      <Link href={`/post/${postId}`}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-9 min-h-[36px] gap-1.5 rounded-full px-3"
          aria-label={`댓글 ${comments}개`}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-[12px] font-semibold tabular-nums">{comments}</span>
        </Button>
      </Link>

      {/* 게시물 온도 */}
      {temperature != null && temperature > 0 && (
        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold tabular-nums ${getTemperatureColor(temperature)}`}
          title="게시물 온도"
        >
          <Flame className="h-3.5 w-3.5" />
          {temperature.toFixed(0)}°
        </div>
      )}

      {/* 우측: 북마크 + 공유 */}
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className={`h-9 w-9 min-w-[36px] rounded-full ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={onBookmark}
          onMouseEnter={onBookmarkHover}
          onFocus={onBookmarkHover}
          aria-label={isBookmarked ? "북마크 해제" : "북마크 추가"}
          aria-pressed={isBookmarked}
        >
          <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} />
        </Button>
        <ShareMenu postId={postId} postTitle={postTitle} />
      </div>
    </div>
  )
}
