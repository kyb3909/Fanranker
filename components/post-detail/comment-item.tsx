"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp, MessageCircle } from "lucide-react"
import type { Comment } from "./post-detail-types"

export interface CommentItemProps {
  comment: Comment
  replyingTo: string | number | null
  replyText: string
  onReplyTextChange: (text: string) => void
  onSetReplyingTo: (id: string | number | null) => void
  onReplySubmit: (commentId: string | number) => void
  depth: number
  isSubmittingReply?: string | number | null
}

/**
 * 재귀적으로 댓글을 렌더링하는 컴포넌트
 * 무한 중첩 대댓글 지원
 */
export function CommentItem({
  comment,
  replyingTo,
  replyText,
  onReplyTextChange,
  onSetReplyingTo,
  onReplySubmit,
  depth,
  isSubmittingReply = null,
}: CommentItemProps) {
  const isReplying = replyingTo === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const maxDepth = 5 // 최대 중첩 깊이 제한 (UI 복잡도 방지)

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Avatar className={depth === 0 ? "h-10 w-10" : "h-8 w-8"}>
          <AvatarImage src={comment.avatar || "/placeholder.svg"} alt={comment.author} />
          <AvatarFallback>{comment.author[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-foreground ${depth === 0 ? "" : "text-sm"}`}>
              {comment.author}
            </span>
            <span className={`text-muted-foreground ${depth === 0 ? "text-sm" : "text-xs"}`}>
              {comment.timestamp}
            </span>
          </div>
          <p className={`text-foreground leading-relaxed ${depth === 0 ? "" : "text-sm"}`}>
            {comment.content}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className={`gap-1 text-muted-foreground ${depth === 0 ? "h-8" : "h-7"}`}>
              <ArrowUp className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
              <span className={depth === 0 ? "text-sm" : "text-xs"}>{comment.upvotes}</span>
            </Button>
            {depth < maxDepth && (
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1 text-muted-foreground ${depth === 0 ? "h-8" : "h-7"}`}
                onClick={() => onSetReplyingTo(isReplying ? null : comment.id)}
              >
                <MessageCircle className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
                <span className={depth === 0 ? "text-sm" : "text-xs"}>
                  답글 {comment.replies?.length || 0}개
                </span>
              </Button>
            )}
          </div>

          {/* Reply Input */}
          {isReplying && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="답글을 입력하세요..."
                className="min-h-[80px] resize-none"
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    onReplySubmit(comment.id)
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onSetReplyingTo(null)
                    onReplyTextChange("")
                  }}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  onClick={() => onReplySubmit(comment.id)}
                  disabled={!replyText.trim() || isSubmittingReply === comment.id}
                >
                  {isSubmittingReply === comment.id ? '작성 중...' : '답글 작성'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested Replies - 재귀적으로 렌더링 */}
      {hasReplies && (
        <div className={`space-y-4 border-l-2 border-border pl-4 ${depth === 0 ? "ml-12" : "ml-8"}`}>
          {comment.replies!.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replyingTo={replyingTo}
              replyText={replyText}
              onReplyTextChange={onReplyTextChange}
              onSetReplyingTo={onSetReplyingTo}
              onReplySubmit={onReplySubmit}
              depth={depth + 1}
              isSubmittingReply={isSubmittingReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}
