"use client"

import { useState } from "react"
import { toast } from "@/hooks/use-toast"
import { reportClientError } from "@/lib/client-error"
import type { Comment } from "@/types/post-detail"

/**
 * 개별 댓글의 수정/삭제/투표 상태 + 데이터 로직
 * (Phase 4a — comment-item 에서 추출, 동작 변경 0).
 */
export function useCommentActions(
  comment: Comment,
  currentUserId: string | null | undefined,
  onCommentUpdated: () => void
) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [voteCount, setVoteCount] = useState(comment.upvotes)
  const [myVote, setMyVote] = useState<"up" | "down" | null>(null)
  const [isVoting, setIsVoting] = useState(false)

  const handleEdit = async (sticker?: { id: string; name: string; image_url: string } | null) => {
    if ((!editText.trim() && !sticker) || isSavingEdit) return
    setIsSavingEdit(true)
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editText.trim(),
          sticker_id: sticker?.id || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      setIsEditing(false)
      onCommentUpdated()
    } catch (error) {
      reportClientError("comments.update", error)
      toast({
        variant: "destructive",
        title: "수정 실패",
        description: error instanceof Error ? error.message : "댓글 수정에 실패했습니다.",
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return
    try {
      const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      onCommentUpdated()
    } catch (error) {
      reportClientError("comments.delete", error)
      toast({
        variant: "destructive",
        title: "삭제 실패",
        description: error instanceof Error ? error.message : "댓글 삭제에 실패했습니다.",
      })
    }
  }

  const handleVote = async (type: "up" | "down") => {
    if (!currentUserId) {
      toast({
        variant: "destructive",
        title: "로그인 필요",
        description: "투표하려면 로그인해주세요.",
      })
      return
    }
    if (isVoting) return
    setIsVoting(true)
    const prevVote = myVote
    const prevCount = voteCount
    if (myVote === type) {
      setMyVote(null)
      setVoteCount((prev) => (type === "up" ? prev - 1 : prev + 1))
    } else {
      const delta = type === "up" ? 1 : -1
      const reverseDelta = prevVote ? (prevVote === "up" ? -1 : 1) : 0
      setMyVote(type)
      setVoteCount((prev) => prev + delta + reverseDelta)
    }
    try {
      const res = await fetch(`/api/comments/${comment.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setVoteCount(data.voteCount)
      setMyVote(data.voteType)
    } catch (error) {
      // 무알림 롤백이었음 — 실패 표면화 + 보고 (인벤토리 A)
      reportClientError("comments.vote", error, { toast: "투표 처리에 실패했습니다" })
      setMyVote(prevVote)
      setVoteCount(prevCount)
    } finally {
      setIsVoting(false)
    }
  }

  return {
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
  }
}
