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
    <div className="border-border mt-3 flex items-center gap-4 border-t pt-3">
      {/* 투표 */}
      <VoteButtons voteCount={voteCount} myVote={myVote} onVote={onVote} size="sm" />

      {/* 댓글 */}
      <Link
        href={`/post/${postId}`}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        <span className="text-[12px] font-medium tabular-nums">{comments}</span>
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
            <span className="bg-muted text-muted-foreground hover:text-foreground inline-flex items-center rounded px-2 py-1 text-[10px] font-medium transition-colors">
              {community}
            </span>
          </Link>
        )}
      </div>
    </div>
  )
}
