"use client"

import { MessageCircle } from "lucide-react"
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 18,
        paddingTop: 14,
        borderTop: "1px solid var(--wc-line)",
      }}
    >
      <VoteButtons voteCount={voteCount} myVote={myVote} onVote={handleVote} size="md" />

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: "0 13px",
          borderRadius: 17,
          border: "1px solid var(--wc-line-2)",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--wc-mute)",
        }}
      >
        <MessageCircle style={{ width: 14, height: 14 }} />
        {commentCount}
      </span>

      <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button
          onClick={handleBookmark}
          aria-label={isBookmarked ? "북마크 해제" : "북마크"}
          aria-pressed={isBookmarked}
          style={{
            height: 34,
            padding: "0 13px",
            borderRadius: 17,
            fontSize: 12.5,
            fontWeight: 700,
            border: isBookmarked ? "1px solid var(--wc-burgundy)" : "1px solid var(--wc-line-2)",
            background: isBookmarked ? "var(--wc-soft)" : "transparent",
            color: isBookmarked ? "var(--wc-burgundy)" : "var(--wc-mute)",
            cursor: "pointer",
          }}
        >
          {isBookmarked ? "★ 저장됨" : "☆ 북마크"}
        </button>
        <ShareMenu postId={postId} postTitle={postTitle} />
      </span>
    </div>
  )
}
