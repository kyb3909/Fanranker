"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { Comment } from "./post-detail-types"
import { ReportDialog } from "@/components/report-dialog"
import { CommentActions } from "./comment-actions"
import { CommentEditForm } from "./comment-edit-form"
import { CommentReplyForm } from "./comment-reply-form"

export interface CommentItemProps {
  comment: Comment; currentUserId?: string | null
  replyingTo: string | number | null; replyText: string
  onReplyTextChange: (text: string) => void
  onSetReplyingTo: (id: string | number | null) => void
  onReplySubmit: (commentId: string | number) => void
  onCommentUpdated: () => void
  depth: number; isSubmittingReply?: string | number | null
}

const MAX_DEPTH = 5

/** 재귀적으로 댓글을 렌더링하는 컴포넌트 (무한 중첩 대댓글 지원) */
export function CommentItem({
  comment, currentUserId, replyingTo, replyText,
  onReplyTextChange, onSetReplyingTo, onReplySubmit,
  onCommentUpdated, depth, isSubmittingReply = null,
}: CommentItemProps) {
  const isReplying = replyingTo === comment.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const isOwner = !!(currentUserId && comment.userId === currentUserId)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [voteCount, setVoteCount] = useState(comment.upvotes)
  const [myVote, setMyVote] = useState<'up' | 'down' | null>(null)
  const [isVoting, setIsVoting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const handleEdit = async () => {
    if (!editText.trim() || isSavingEdit) return
    setIsSavingEdit(true)
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editText.trim() }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      setIsEditing(false)
      onCommentUpdated()
    } catch (error) {
      toast({ variant: 'destructive', title: '수정 실패', description: error instanceof Error ? error.message : '댓글 수정에 실패했습니다.' })
    } finally { setIsSavingEdit(false) }
  }

  const handleDelete = async () => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
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
    const prevVote = myVote
    const prevCount = voteCount
    if (myVote === type) {
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setVoteCount(data.voteCount)
      setMyVote(data.voteType)
    } catch {
      setMyVote(prevVote)
      setVoteCount(prevCount)
    } finally { setIsVoting(false) }
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
            <span className={`font-semibold text-foreground ${depth === 0 ? "" : "text-sm"}`}>{comment.author}</span>
            <span className={`text-muted-foreground ${depth === 0 ? "text-sm" : "text-xs"}`}>{comment.timestamp}</span>
            {isOwner && !isEditing && (<div className="flex items-center gap-0.5 ml-auto">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setIsEditing(true); setEditText(comment.content) }}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={handleDelete}><Trash2 className="h-3 w-3" /></Button>
            </div>)}
          </div>
          {isEditing ? (
            <CommentEditForm editText={editText} isSaving={isSavingEdit} onEditTextChange={setEditText} onSave={handleEdit} onCancel={() => setIsEditing(false)} />
          ) : (
            <p className={`text-foreground leading-relaxed ${depth === 0 ? "" : "text-sm"}`}>{comment.content}</p>
          )}
          <CommentActions depth={depth} maxDepth={MAX_DEPTH} voteCount={voteCount} myVote={myVote}
            isReplying={isReplying} isOwner={isOwner} currentUserId={currentUserId}
            onVote={handleVote} onToggleReply={() => onSetReplyingTo(isReplying ? null : comment.id)} onReport={() => setReportOpen(true)} />
          {isReplying && (
            <CommentReplyForm replyText={replyText} isSubmitting={isSubmittingReply === comment.id}
              onReplyTextChange={onReplyTextChange} onSubmit={() => onReplySubmit(comment.id)}
              onCancel={() => { onSetReplyingTo(null); onReplyTextChange("") }} />
          )}
        </div>
      </div>
      <ReportDialog targetType="comment" targetId={String(comment.id)} open={reportOpen} onOpenChange={setReportOpen} />
      {hasReplies && (
        <div className={`space-y-4 border-l-2 border-border pl-4 ${depth === 0 ? "ml-12" : "ml-8"}`}>
          {comment.replies!.map((reply) => (
            <CommentItem key={reply.id} comment={reply} currentUserId={currentUserId}
              replyingTo={replyingTo} replyText={replyText} onReplyTextChange={onReplyTextChange}
              onSetReplyingTo={onSetReplyingTo} onReplySubmit={onReplySubmit}
              onCommentUpdated={onCommentUpdated} depth={depth + 1} isSubmittingReply={isSubmittingReply} />
          ))}
        </div>
      )}
    </div>
  )
}
