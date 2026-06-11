"use client"

import { Button } from "@/components/ui/button"
import { MessageCircle, Bookmark } from "lucide-react"
import { ShareMenu } from "@/components/share-menu"
import { VoteButtons } from "@/components/vote-buttons"
import { usePostActions } from "@/hooks/use-post-actions"

interface PostActionsProps {
  postId: string | number
  postTitle: string
  initialUpvotes: number
  initialIsUpvoted: boolean
  commentCount: number
}

export function PostActions({
  postId,
  postTitle,
  initialUpvotes,
  initialIsUpvoted,
  commentCount,
}: PostActionsProps) {
  const { voteCount, myVote, isBookmarked, handleVote, handleBookmark } = usePostActions(
    postId,
    initialUpvotes,
    initialIsUpvoted
  )

  return (
    <div className="mt-4 flex items-center gap-2">
      {/* Upvote/Downvote */}
      <VoteButtons voteCount={voteCount} myVote={myVote} onVote={handleVote} size="md" />

      {/* Comments */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 rounded-full"
        style={{
          background: "var(--wc-soft)",
          color: "var(--wc-ink)",
        }}
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-bold tabular-nums">{commentCount}</span>
      </Button>

      {/* Bookmark */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full"
        style={{
          color: isBookmarked ? "var(--wc-burgundy)" : "var(--wc-mute)",
        }}
        onClick={handleBookmark}
        aria-label={isBookmarked ? "북마크 해제" : "북마크"}
      >
        <Bookmark className={`h-5 w-5 ${isBookmarked ? "fill-current" : ""}`} />
      </Button>

      {/* Share */}
      <ShareMenu postId={postId} postTitle={postTitle} />
    </div>
  )
}
