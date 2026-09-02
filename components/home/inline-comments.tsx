"use client"

import { useUser, useClerk } from "@clerk/nextjs"
import { CommentItem } from "@/components/post-detail/comment-item"
import { CommentForm } from "@/components/post-detail/comment-form"
import { useComments } from "@/hooks/use-comments"
import { useIsAdmin } from "@/hooks/use-is-admin"
import { countAllComments } from "@/types/post-detail"

/** 접힌 상태에서 보여주는 댓글 수 — 인스타그램식 "상위 몇 개 + 모두 보기" */
const PREVIEW = 2

/**
 * 피드 카드 안 댓글 (2026-09-03 운영자: "거기에 바로 댓글을 달고 볼 수 있었으면").
 *
 * 글 페이지의 댓글 부품(useComments·CommentItem·CommentForm)을 그대로 쓴다 — 여기서 단 댓글은
 * 글 페이지 댓글과 같은 것이고, 비로그인 처리(제출할 때 로그인 창, 쓰던 글 보존)도 같다.
 * 마운트 즉시 댓글을 불러오므로 **카드가 화면에 들어왔을 때만** 마운트할 것 (WallPostCard 가 담당).
 */
export function InlineComments({
  postId,
  expanded,
  onExpand,
  onCountChange,
}: {
  postId: string
  /** 전부 펼침 (false 면 상위 PREVIEW 개 + "모두 보기") */
  expanded: boolean
  onExpand: () => void
  /** 실제 댓글 수(대댓글 포함)가 확정되면 카드의 숫자를 맞춘다 */
  onCountChange: (count: number) => void
}) {
  const { user, isLoaded } = useUser()
  const clerk = useClerk()
  const isAdmin = useIsAdmin()
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
  } = useComments(postId, onCountChange)

  const total = countAllComments(comments)
  const shown = expanded ? comments : comments.slice(0, PREVIEW)
  const hasMore = !expanded && comments.length > PREVIEW

  return (
    <div
      className="flex flex-col gap-3 px-4 pt-3 pb-4"
      style={{ borderTop: "1px solid var(--wc-line)" }}
    >
      {isLoadingComments ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <div className="h-3 w-2/3 rounded" style={{ background: "var(--wc-soft)" }} />
          <div className="h-3 w-1/2 rounded" style={{ background: "var(--wc-soft)" }} />
        </div>
      ) : loadFailed ? (
        <button
          type="button"
          onClick={retryLoadComments}
          className="self-start text-[12px] font-bold"
          style={{ color: "var(--wc-mute)" }}
        >
          댓글을 불러오지 못했어요 · 다시 시도
        </button>
      ) : (
        shown.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={user?.id ?? null}
            replyingTo={replyingTo}
            replyText={replyText}
            onReplyTextChange={setReplyText}
            onSetReplyingTo={setReplyingTo}
            onReplySubmit={handleReplySubmit}
            onCommentUpdated={reloadComments}
            depth={0}
            isSubmittingReply={isSubmittingReply}
          />
        ))
      )}
      {hasMore && (
        <button
          type="button"
          onClick={onExpand}
          className="self-start text-[13px] font-bold"
          style={{ color: "var(--wc-mute)" }}
        >
          댓글 {total}개 모두 보기
        </button>
      )}
      {/* 비로그인 판정은 isLoaded 이후에만 — 로딩 중엔 로그인 모양을 유지해 hydration 불일치(#418 전례)를 피한다 */}
      <CommentForm
        onSubmit={handleCommentSubmit}
        isSubmitting={isSubmittingComment}
        isAdmin={isAdmin}
        signedIn={isLoaded ? !!user : true}
        onRequireSignIn={() => clerk.openSignIn()}
      />
    </div>
  )
}
