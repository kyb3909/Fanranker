"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "@/hooks/use-toast"
import { reportClientError } from "@/lib/client-error"
import { countAllComments, transformComments } from "@/types/post-detail"
import type { Comment } from "@/types/post-detail"

export interface CommentsInitialData {
  comments: {
    id: string
    user_id: string
    parent_id: string | null
    content: string
    vote_count: number
    created_at: string
    sticker_id?: string | null
    stickers?: { id: string; name: string; image_url: string } | null
  }[]
  profiles: { user_id: string; nickname: string; avatar_url: string | null }[]
  equippedTitles: {
    user_id: string
    board_slug: string
    adj_titles: { title: string; rarity: string } | null
    noun_titles: { title: string } | null
  }[]
}

/**
 * 댓글 상태 + 데이터 로직 (Phase 4a — comment-section 에서 추출, 동작 변경 0).
 * 컴포넌트는 표현만 담당한다 (use-betting-* ↔ betting-* 분리 구조 준거).
 */
export function useComments(
  postId: string | number,
  onCommentCountChange?: (count: number) => void,
  initialData?: CommentsInitialData
) {
  const initialComments = initialData
    ? transformComments(initialData.comments, initialData.profiles, initialData.equippedTitles)
    : []

  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [isLoadingComments, setIsLoadingComments] = useState(!initialData)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | number | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isSubmittingReply, setIsSubmittingReply] = useState<string | number | null>(null)
  const [commentSort, setCommentSort] = useState<"newest" | "popular">("newest")
  const [loadFailed, setLoadFailed] = useState(false)

  const updateComments = useCallback(
    (newComments: Comment[]) => {
      setComments(newComments)
      onCommentCountChange?.(countAllComments(newComments))
    },
    [onCommentCountChange]
  )

  const reloadComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?post_id=${postId}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("댓글을 불러오는데 실패했습니다.")
      const { comments: fetchedComments, profiles, equippedTitles } = await response.json()
      const transformedComments = transformComments(
        fetchedComments || [],
        profiles || [],
        equippedTitles || []
      )
      updateComments(transformedComments)
      setLoadFailed(false)
    } catch (error) {
      // 빈 목록으로 위장하지 않는다 — 에러 상태로 표면화 + 보고
      reportClientError("comments.load", error)
      setLoadFailed(true)
    }
  }, [postId, updateComments])

  const retryLoadComments = () => {
    setIsLoadingComments(true)
    reloadComments().finally(() => setIsLoadingComments(false))
  }

  const hasInitialData = useRef(!!initialData)
  useEffect(() => {
    if (hasInitialData.current) {
      hasInitialData.current = false
      onCommentCountChange?.(countAllComments(initialComments))
      return
    }
    setIsLoadingComments(true)
    reloadComments().finally(() => setIsLoadingComments(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadComments])

  const handleCommentSubmit = async (
    text: string,
    sticker: { id: string; name: string; image_url: string } | null,
    isSecret?: boolean
  ) => {
    setIsSubmittingComment(true)
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: String(postId),
          content: text,
          ...(sticker && { sticker_id: sticker.id }),
          ...(isSecret && { is_secret: true }),
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        if (response.status === 429 && error.code === "COOLDOWN_ACTIVE") {
          throw new Error(
            error.error || "댓글을 너무 빠르게 작성하셨습니다. 10초 후에 다시 시도해주세요."
          )
        }
        throw new Error(error.error || "댓글 작성에 실패했습니다.")
      }
      await reloadComments()
    } catch (error) {
      reportClientError("comments.create", error)
      toast({
        variant: "destructive",
        title: "댓글 작성 실패",
        description: error instanceof Error ? error.message : "댓글 작성에 실패했습니다.",
      })
      throw error // re-throw for CommentForm to restore state
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleReplySubmit = async (
    commentId: string | number,
    sticker?: { id: string; name: string; image_url: string } | null
  ) => {
    if ((!replyText.trim() && !sticker) || isSubmittingReply === commentId) return

    setIsSubmittingReply(commentId)
    const textToSubmit = replyText.trim()
    setReplyText("")

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: String(postId),
          parent_id: String(commentId),
          content: textToSubmit || (sticker ? "" : ""),
          ...(sticker?.id && { sticker_id: sticker.id }),
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        if (response.status === 429 && error.code === "COOLDOWN_ACTIVE") {
          throw new Error(
            error.error || "답글을 너무 빠르게 작성하셨습니다. 10초 후에 다시 시도해주세요."
          )
        }
        throw new Error(error.error || "답글 작성에 실패했습니다.")
      }
      await reloadComments()
      setReplyingTo(null)
    } catch (error) {
      reportClientError("comments.reply", error)
      toast({
        variant: "destructive",
        title: "답글 작성 실패",
        description: error instanceof Error ? error.message : "답글 작성에 실패했습니다.",
      })
      setReplyText(textToSubmit)
    } finally {
      setIsSubmittingReply(null)
    }
  }

  return {
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
  }
}
