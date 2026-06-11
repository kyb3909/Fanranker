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
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 10,
        rowGap: 8,
        marginTop: 18,
        paddingTop: 14,
        borderTop: "1px solid var(--wc-line)",
      }}
    >
      {/* Vote pill — inline-flex removes baseline offset that caused vertical misalignment */}
      <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
        <VoteButtons voteCount={voteCount} myVote={myVote} onVote={handleVote} size="md" />
      </span>

      {/* Comment count pill */}
      <span
        className="inline-flex items-center gap-[4px] px-[10px] text-[12px] sm:gap-[6px] sm:px-[13px] sm:text-[13px]"
        style={{
          height: 34,
          borderRadius: 17,
          border: "1px solid var(--wc-line-2)",
          fontWeight: 700,
          color: "var(--wc-mute)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <MessageCircle style={{ width: 14, height: 14 }} />
        {commentCount}
      </span>

      {/* Right group */}
      <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleBookmark}
          aria-label={isBookmarked ? "북마크 해제" : "북마크"}
          aria-pressed={isBookmarked}
          className="inline-flex items-center gap-[4px] px-[10px] text-[12px] sm:gap-[6px] sm:px-[13px]"
          style={{
            height: 34,
            borderRadius: 17,
            fontWeight: 700,
            border: isBookmarked ? "1px solid var(--wc-burgundy)" : "1px solid var(--wc-line-2)",
            background: isBookmarked ? "var(--wc-soft)" : "transparent",
            color: isBookmarked ? "var(--wc-burgundy)" : "var(--wc-mute)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {isBookmarked ? "★" : "☆"}
          <span className="hidden sm:inline">{isBookmarked ? " 저장됨" : " 북마크"}</span>
        </button>
        <ShareMenu postId={postId} postTitle={postTitle} />
      </span>
    </div>
  )
}
