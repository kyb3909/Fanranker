"use client"

import { Button } from "@/components/ui/button"
import { MessageCircle, Bookmark } from "lucide-react"
import Link from "@/components/ui/app-link"
import { ShareMenu } from "@/components/share-menu"
import { VoteButtons } from "@/components/vote-buttons"

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
}: PostCardFooterProps) {
  return (
    <div className="border-border mt-3 flex items-center gap-4 border-t pt-3">
      {/* 투표 */}
      <VoteButtons voteCount={voteCount} myVote={myVote} onVote={onVote} size="sm" />

      {/* 댓글 */}
      <Link
        href={`/post/${postId}`}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 transition-colors"
        aria-label={`댓글 ${comments}개`}
      >
        <MessageCircle className="h-4 w-4" />
        <span className="text-[12px] font-medium tabular-nums">{comments}</span>
      </Link>

      {/* 우측: 북마크 + 공유 — 게시판 배지는 상단 카테고리 라벨로 이동 */}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-11 w-11 min-w-[44px] rounded-full ${isBookmarked ? "text-primary fill-primary" : "text-muted-foreground hover:text-foreground"}`}
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
