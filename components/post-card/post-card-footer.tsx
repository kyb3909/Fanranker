"use client"

import { Button } from "@/components/ui/button"
import { ArrowUp, ArrowDown, MessageCircle, Bookmark } from "lucide-react"
import Link from "@/components/ui/app-link"
import { ShareMenu } from "@/components/share-menu"

export interface PostCardFooterProps {
  postId: number | string
  postTitle: string
  voteCount: number
  myVote: "up" | "down" | null
  comments: number
  isBookmarked: boolean
  onVote: (type: "up" | "down") => void
  onBookmark: () => void
  onBookmarkHover: () => void
  community?: string
  communityLink?: string
}

export function PostCardFooter({
  postId,
  postTitle,
  voteCount,
  myVote,
  comments,
  isBookmarked,
  onVote,
  onBookmark,
  onBookmarkHover,
  community,
  communityLink,
}: PostCardFooterProps) {
  return (
    <div className="border-border/40 mt-3 flex items-center gap-4 border-t pt-3">
      {/* 투표 */}
      <div className="flex items-center gap-0.5">
        <button
          className={`hover:bg-muted rounded-full p-1.5 transition-colors ${myVote === "up" ? "text-primary" : "text-muted-foreground"}`}
          onClick={() => onVote("up")}
          aria-label="추천"
          aria-pressed={myVote === "up"}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <span
          className={`min-w-[20px] text-center text-[12px] font-semibold tabular-nums ${voteCount > 0 ? "text-primary" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {voteCount}
        </span>
        <button
          className={`hover:bg-muted rounded-full p-1.5 transition-colors ${myVote === "down" ? "text-destructive" : "text-muted-foreground"}`}
          onClick={() => onVote("down")}
          aria-label="비추천"
          aria-pressed={myVote === "down"}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>

      {/* 댓글 */}
      <Link
        href={`/post/${postId}`}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        <span className="text-[12px] font-semibold tabular-nums">{comments}</span>
      </Link>

      {/* 우측: 북마크 + 공유 + 게시판 배지 */}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 min-w-[32px] rounded-full ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={onBookmark}
          onMouseEnter={onBookmarkHover}
          onFocus={onBookmarkHover}
          aria-label={isBookmarked ? "북마크 해제" : "북마크 추가"}
          aria-pressed={isBookmarked}
        >
          <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} />
        </Button>
        <ShareMenu postId={postId} postTitle={postTitle} />
        {community && communityLink && (
          <Link href={`/community/${communityLink}`} className="ml-1">
            <span className="bg-muted text-muted-foreground hover:text-foreground inline-flex items-center rounded px-2 py-1 text-[10px] font-bold transition-colors">
              {community}
            </span>
          </Link>
        )}
      </div>
    </div>
  )
}
