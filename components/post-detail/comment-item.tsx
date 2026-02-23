"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp, ArrowDown, MessageCircle, Pencil, Trash2, X, Check, Flag } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { Comment } from "./post-detail-types"
import { ReportDialog } from "@/components/report-dialog"

export interface CommentItemProps {
  comment: Comment
  currentUserId?: string | null
  replyingTo: string | number | null
  replyText: string
  onReplyTextChange: (text: string) => void
  onSetReplyingTo: (id: string | number | null) => void
  onReplySubmit: (commentId: string | number) => void
  onCommentUpdated: () => void
  depth: number
  isSubmittingReply?: string | number | null
}

/**
 * 재귀적으로 댓글을 렌더링하는 컴포넌트
 * 무한 중첩 대댓글 지원, 수정/삭제/투표 포함
 */
export function CommentItem({
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
}: CommentItemProps) {
  const isReplying = replyingTo === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const maxDepth = 5
  const isOwner = currentUserId && comment.userId === currentUserId

  // 수정 상태
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // 투표 상태
  const [voteCount, setVoteCount] = useState(comment.upvotes)
  const [myVote, setMyVote] = useState<'up' | 'down' | null>(null)
  const [isVoting, setIsVoting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const handleEdit = async () => {
    if (!editText.trim() || isSavingEdit) return
    setIsSavingEdit(true)
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editText.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      setIsEditing(false)
      onCommentUpdated()
    } catch (error) {
      toast({ variant: 'destructive', title: '수정 실패', description: error instanceof Error ? error.message : '댓글 수정에 실패했습니다.' })
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      onCommentUpdated()
    } catch (error) {
      toast({ variant: 'destructive', title: '삭제 실패', description: error instanceof Error ? error.message : '댓글 삭제에 실패했습니다.' })
    }
  }

  const handleVote = async (type: 'up' | 'down') => {
    if (!currentUserId) {
      toast({ variant: 'destructive', title: '로그인 필요', description: '투표하려면 로그인해주세요.' })
      return
    }
    if (isVoting) return
    setIsVoting(true)

    // 낙관적 업데이트
    const prevVote = myVote
    const prevCount = voteCount
    const isSameVote = myVote === type
    if (isSameVote) {
      setMyVote(null)
      setVoteCount(prev => type === 'up' ? prev - 1 : prev + 1)
    } else {
      const delta = type === 'up' ? 1 : -1
      const reverseDelta = prevVote ? (prevVote === 'up' ? -1 : 1) : 0
      setMyVote(type)
      setVoteCount(prev => prev + delta + reverseDelta)
    }

    try {
      const res = await fetch(`/api/comments/${comment.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setVoteCount(data.voteCount)
      setMyVote(data.voteType)
    } catch {
      // 롤백
      setMyVote(prevVote)
      setVoteCount(prevCount)
    } finally {
      setIsVoting(false)
    }
  }

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
            {isOwner && !isEditing && (
              <div className="flex items-center gap-0.5 ml-auto">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setIsEditing(true); setEditText(comment.content) }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[60px] resize-none text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEdit() }}
              />
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(false)}>
                  <X className="h-3 w-3 mr-1" />취소
                </Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={handleEdit} disabled={!editText.trim() || isSavingEdit}>
                  <Check className="h-3 w-3 mr-1" />{isSavingEdit ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          ) : (
            <p className={`text-foreground leading-relaxed ${depth === 0 ? "" : "text-sm"}`}>
              {comment.content}
            </p>
          )}

          <div className="flex items-center gap-1">
            {/* 추천 */}
            <Button
              variant="ghost"
              size="sm"
              className={`gap-0.5 h-7 px-1.5 ${myVote === 'up' ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => handleVote('up')}
            >
              <ArrowUp className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
            </Button>
            <span className={`text-sm font-medium min-w-[1.5rem] text-center ${voteCount > 0 ? 'text-primary' : voteCount < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {voteCount}
            </span>
            {/* 비추천 */}
            <Button
              variant="ghost"
              size="sm"
              className={`gap-0.5 h-7 px-1.5 ${myVote === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}
              onClick={() => handleVote('down')}
            >
              <ArrowDown className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
            </Button>

            {depth < maxDepth && (
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1 text-muted-foreground ${depth === 0 ? "h-7" : "h-7"} ml-1`}
                onClick={() => onSetReplyingTo(isReplying ? null : comment.id)}
              >
                <MessageCircle className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
                <span className={depth === 0 ? "text-xs" : "text-xs"}>
                  답글
                </span>
              </Button>
            )}

            {!isOwner && currentUserId && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground h-7 ml-auto"
                onClick={() => setReportOpen(true)}
                title="신고하기"
              >
                <Flag className={depth === 0 ? "h-4 w-4" : "h-3 w-3"} />
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

      <ReportDialog
        targetType="comment"
        targetId={String(comment.id)}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />

      {/* Nested Replies */}
      {hasReplies && (
        <div className={`space-y-4 border-l-2 border-border pl-4 ${depth === 0 ? "ml-12" : "ml-8"}`}>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
