"use client"

import { memo } from "react"
import Image from "next/image"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2, Lock } from "lucide-react"
import Link from "@/components/ui/app-link"
import { useCommentActions } from "@/hooks/use-comment-actions"
import type { Comment } from "@/types/post-detail"
import { openReport } from "@/hooks/use-report-dialog"
import { CommentActions } from "./comment-actions"
import { CommentEditForm } from "./comment-edit-form"
import { CommentReplyForm } from "./comment-reply-form"
import { TitleBadge } from "@/components/profile/title-badge"

interface CommentItemProps {
  comment: Comment
  currentUserId?: string | null
  replyingTo: string | number | null
  replyText: string
  onReplyTextChange: (text: string) => void
  onSetReplyingTo: (id: string | number | null) => void
  onReplySubmit: (
    commentId: string | number,
    sticker?: { id: string; name: string; image_url: string } | null
  ) => void
  onCommentUpdated: () => void
  depth: number
  isSubmittingReply?: string | number | null
  onBlockUser?: (userId: string) => void
}

const MAX_DEPTH = 5

/** 재귀적으로 댓글을 렌더링하는 컴포넌트 (무한 중첩 대댓글 지원) */
export const CommentItem = memo(function CommentItem({
  comment,
  currentUserId,
  replyingTo,
  replyText,
  onReplyTextChange,
  onSetReplyingTo,
  onReplySubmit,
  onCommentUpdated,
  depth,
  isSubmittingReply = null,
  onBlockUser,
}: CommentItemProps) {
  const isReplying = replyingTo === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const isOwner = !!(currentUserId && comment.userId === currentUserId)
  const {
    isEditing,
    setIsEditing,
    editText,
    setEditText,
    isSavingEdit,
    voteCount,
    myVote,
    handleEdit,
    handleDelete,
    handleVote,
  } = useCommentActions(comment, currentUserId, onCommentUpdated)

  return (
    <div className="space-y-3">
      <div className="flex gap-[11px]">
        <Avatar className={depth === 0 ? "h-9 w-9" : "h-7 w-7"}>
          <AvatarImage src={comment.avatar || "/placeholder.svg"} alt={comment.author} />
          <AvatarFallback>{comment.author[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                {comment.userId ? (
                  <Link
                    href={`/profile/${comment.userId}`}
                    className="font-extrabold transition-colors hover:text-[color:var(--wc-burgundy)]"
                    style={{ fontSize: depth === 0 ? 13.5 : 12.5, color: "var(--wc-ink)" }}
                  >
                    {comment.author}
                  </Link>
                ) : (
                  <span
                    className="font-extrabold"
                    style={{ fontSize: depth === 0 ? 13.5 : 12.5, color: "var(--wc-ink)" }}
                  >
                    {comment.author}
                  </span>
                )}
                <span className="text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
                  {comment.timestamp}
                </span>
                {comment.isSecret && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                    style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
                    title="원글 작성자와 운영자만 볼 수 있는 비밀댓글입니다."
                  >
                    <Lock className="h-2.5 w-2.5" />
                    비밀댓글
                  </span>
                )}
              </div>
              {comment.titleDisplay &&
                (comment.titleDisplay.adjTitle || comment.titleDisplay.nounTitle) && (
                  <TitleBadge
                    adjTitle={comment.titleDisplay.adjTitle}
                    nounTitle={comment.titleDisplay.nounTitle}
                    rarity={comment.titleDisplay.rarity}
                    size="sm"
                    className="mt-0.5 w-fit"
                  />
                )}
            </div>
            {isOwner && !isEditing && (
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                  onClick={() => {
                    setIsEditing(true)
                    setEditText(comment.content)
                  }}
                  aria-label="댓글 수정"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                  onClick={handleDelete}
                  aria-label="댓글 삭제"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          {isEditing ? (
            <CommentEditForm
              editText={editText}
              isSaving={isSavingEdit}
              currentSticker={comment.sticker ?? undefined}
              onEditTextChange={setEditText}
              onSave={handleEdit}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <div>
              {comment.content && (
                <p
                  style={{
                    fontSize: depth === 0 ? 14 : 13,
                    lineHeight: 1.65,
                    color: "var(--wc-ink)",
                    margin: "5px 0 0",
                    // 작성 시 줄바꿈/빈 줄을 그대로 보존 (기본 normal은 개행을 공백으로 합침)
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {comment.content}
                </p>
              )}
              {comment.sticker && (
                <div className="mt-1">
                  <Image
                    src={comment.sticker.image_url}
                    alt={comment.sticker.name}
                    width={160}
                    height={160}
                    className="h-40 w-40 object-contain"
                    title={comment.sticker.name}
                  />
                </div>
              )}
            </div>
          )}
          <CommentActions
            depth={depth}
            maxDepth={MAX_DEPTH}
            voteCount={voteCount}
            myVote={myVote}
            isReplying={isReplying}
            isOwner={isOwner}
            currentUserId={currentUserId}
            onVote={handleVote}
            onToggleReply={() => onSetReplyingTo(isReplying ? null : comment.id)}
            onReport={() => openReport("comment", String(comment.id))}
            onBlock={
              onBlockUser && comment.userId
                ? () => {
                    if (
                      confirm(
                        `${comment.author}님을 차단하시겠습니까?\n차단하면 이 유저의 글과 댓글이 보이지 않습니다.`
                      )
                    ) {
                      onBlockUser(comment.userId!)
                    }
                  }
                : undefined
            }
          />
          {isReplying && (
            <CommentReplyForm
              replyText={replyText}
              isSubmitting={isSubmittingReply === comment.id}
              onReplyTextChange={onReplyTextChange}
              onSubmit={(sticker) => onReplySubmit(comment.id, sticker)}
              onCancel={() => {
                onSetReplyingTo(null)
                onReplyTextChange("")
              }}
            />
          )}
        </div>
      </div>
      {hasReplies && (
        <div
          className={`space-y-4 pl-4 ${depth === 0 ? "ml-12" : "ml-8"}`}
          style={{ borderLeft: "2px solid var(--wc-line)" }}
        >
          {comment.replies!.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              replyingTo={replyingTo}
              replyText={replyText}
              onReplyTextChange={onReplyTextChange}
              onSetReplyingTo={onSetReplyingTo}
              onReplySubmit={onReplySubmit}
              onCommentUpdated={onCommentUpdated}
              depth={depth + 1}
              isSubmittingReply={isSubmittingReply}
              onBlockUser={onBlockUser}
            />
          ))}
        </div>
      )}
    </div>
  )
})
