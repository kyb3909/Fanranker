"use client"

import { useUser } from "@clerk/nextjs"
import { ArrowUpDown } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { CommentItem } from "./comment-item"
import { CommentForm } from "./comment-form"
import { countAllComments } from "@/types/post-detail"
import { useBlockedUsers } from "@/hooks/use-blocked-users"
import { useComments } from "@/hooks/use-comments"
import type { CommentsInitialData } from "@/hooks/use-comments"

interface CommentSectionProps {
  postId: string | number
  onCommentCountChange?: (count: number) => void
  initialData?: CommentsInitialData
}

export function CommentSection({ postId, onCommentCountChange, initialData }: CommentSectionProps) {
  const { user } = useUser()
  const { isBlocked, toggleBlock } = useBlockedUsers()

  const {
    comments,
    isLoadingComments,
    loadFailed,
    retryLoadComments,
    reloadComments,
    isSubmittingComment,
    handleCommentSubmit,
    replyingTo,
    setReplyingTo,
    replyText,
    setReplyText,
    isSubmittingReply,
    handleReplySubmit,
    commentSort,
    setCommentSort,
  } = useComments(postId, onCommentCountChange, initialData)

  return (
    <div
      className="rounded-xl"
      style={{
        background: "var(--wc-card)",
        boxShadow: "var(--wc-shadow-1)",
        padding: "18px 24px 22px",
      }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800 }}>
            댓글{" "}
            <span className="tnum" style={{ color: "var(--wc-burgundy)" }}>
              {countAllComments(comments)}
            </span>
          </h2>
          {comments.length > 1 && (
            <button
              onClick={() => setCommentSort((s) => (s === "newest" ? "popular" : "newest"))}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors"
              style={{
                color: "var(--wc-mute)",
                background: "var(--wc-soft)",
              }}
            >
              <ArrowUpDown className="h-3 w-3" />
              {commentSort === "newest" ? "최신순" : "인기순"}
            </button>
          )}
        </div>

        <CommentForm onSubmit={handleCommentSubmit} isSubmitting={isSubmittingComment} />

        <Separator />

        {/* Comment List */}
        <div className="space-y-6">
          {isLoadingComments ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                댓글을 불러오는 중...
              </p>
            </div>
          ) : loadFailed ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                댓글을 불러오지 못했습니다.
              </p>
              <button
                onClick={retryLoadComments}
                className="mt-3 rounded-md px-3 py-1.5 text-xs font-bold transition-colors"
                style={{ color: "var(--wc-ink)", background: "var(--wc-soft)" }}
              >
                다시 시도
              </button>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                아직 댓글이 없습니다.
              </p>
            </div>
          ) : (
            [...comments]
              .filter((c) => !c.userId || !isBlocked(c.userId))
              .sort((a, b) => {
                if (commentSort === "popular") return (b.upvotes || 0) - (a.upvotes || 0)
                // 최신순: createdAt 내림차순 (최신이 위)
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              })
              .map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={user?.id}
                  replyingTo={replyingTo}
                  replyText={replyText}
                  onReplyTextChange={setReplyText}
                  onSetReplyingTo={setReplyingTo}
                  onReplySubmit={handleReplySubmit}
                  onCommentUpdated={reloadComments}
                  depth={0}
                  isSubmittingReply={isSubmittingReply}
                  onBlockUser={async (userId) => {
                    await toggleBlock(userId)
                    toast({
                      title: "차단되었습니다",
                      description: "해당 유저의 글과 댓글이 숨겨집니다.",
                    })
                  }}
                />
              ))
          )}
        </div>
      </div>
    </div>
  )
}
