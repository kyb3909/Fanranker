"use client"

import { useState, useEffect, useCallback } from "react"
import { useUser } from "@clerk/nextjs"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { CommentItem } from "./comment-item"
import { countAllComments, transformComments } from "./post-detail-types"
import type { Comment } from "./post-detail-types"
import { StickerPicker } from "@/components/sticker/sticker-picker"

interface CommentSectionProps {
  postId: string | number
  onCommentCountChange?: (count: number) => void
}

export function CommentSection({ postId, onCommentCountChange }: CommentSectionProps) {
  const { user } = useUser()
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(true)

  const updateComments = useCallback(
    (newComments: Comment[]) => {
      setComments(newComments)
      onCommentCountChange?.(countAllComments(newComments))
    },
    [onCommentCountChange]
  )
  const [commentText, setCommentText] = useState("")
  const [replyingTo, setReplyingTo] = useState<string | number | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [isSubmittingReply, setIsSubmittingReply] = useState<string | number | null>(null)
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [selectedSticker, setSelectedSticker] = useState<{
    id: string
    name: string
    image_url: string
  } | null>(null)

  // 댓글 로드
  const reloadComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?post_id=${postId}`)
      if (!response.ok) throw new Error("댓글을 불러오는데 실패했습니다.")
      const { comments: fetchedComments, profiles, equippedTitles } = await response.json()
      const transformedComments = transformComments(
        fetchedComments || [],
        profiles || [],
        equippedTitles || []
      )
      updateComments(transformedComments)
    } catch {
      updateComments([])
    }
  }, [postId, updateComments])

  useEffect(() => {
    setIsLoadingComments(true)
    reloadComments().finally(() => setIsLoadingComments(false))
  }, [reloadComments])

  const handleCommentSubmit = async () => {
    if (!commentText.trim() && !selectedSticker) {
      return
    }
    if (isSubmittingComment) return

    setIsSubmittingComment(true)
    const textToSubmit = commentText.trim()
    const stickerToSubmit = selectedSticker
    setCommentText("")
    setSelectedSticker(null)
    setShowStickerPicker(false)

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_id: postId,
          content: textToSubmit,
          ...(stickerToSubmit && { sticker_id: stickerToSubmit.id }),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        // 쿨다운 에러인 경우 특별 처리
        if (response.status === 429 && error.code === "COOLDOWN_ACTIVE") {
          throw new Error(
            error.error || "댓글을 너무 빠르게 작성하셨습니다. 10초 후에 다시 시도해주세요."
          )
        }
        throw new Error(error.error || "댓글 작성에 실패했습니다.")
      }

      await reloadComments()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "댓글 작성 실패",
        description: error instanceof Error ? error.message : "댓글 작성에 실패했습니다.",
      })
      setCommentText(textToSubmit) // 실패 시 텍스트 복원
      setSelectedSticker(stickerToSubmit) // 실패 시 스티커 복원
    } finally {
      setIsSubmittingComment(false)
    }
  }

  const handleReplySubmit = async (commentId: string | number) => {
    if (!replyText.trim() || isSubmittingReply === commentId) {
      return
    }

    setIsSubmittingReply(commentId)
    const textToSubmit = replyText.trim()
    setReplyText("") // 즉시 입력 필드 비우기 (중복 제출 방지)

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_id: postId,
          parent_id: commentId,
          content: textToSubmit,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        // 쿨다운 에러인 경우 특별 처리
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
      toast({
        variant: "destructive",
        title: "답글 작성 실패",
        description: error instanceof Error ? error.message : "답글 작성에 실패했습니다.",
      })
      setReplyText(textToSubmit) // 실패 시 텍스트 복원
    } finally {
      setIsSubmittingReply(null)
    }
  }

  return (
    <Card className="border-border bg-card border">
      <div className="space-y-6 p-6">
        <h3 className="text-foreground text-xl font-semibold">
          댓글 {countAllComments(comments)}개
        </h3>

        {/* Comment Input */}
        <div className="space-y-3">
          <Textarea
            placeholder="댓글을 입력하세요..."
            className="min-h-[100px] resize-none"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleCommentSubmit()
              }
            }}
          />
          {/* 선택된 스티커 미리보기 */}
          {selectedSticker && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <img
                src={selectedSticker.image_url}
                alt={selectedSticker.name}
                className="h-12 w-12 object-contain"
              />
              <span className="text-foreground text-xs font-medium">{selectedSticker.name}</span>
              <button
                onClick={() => setSelectedSticker(null)}
                className="text-muted-foreground hover:text-foreground ml-auto text-xs"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="relative">
              <button
                onClick={() => setShowStickerPicker(!showStickerPicker)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  showStickerPicker
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                스티커
              </button>
              {showStickerPicker && (
                <StickerPicker
                  onSelect={(sticker) => {
                    setSelectedSticker(sticker)
                    setShowStickerPicker(false)
                  }}
                  onClose={() => setShowStickerPicker(false)}
                />
              )}
            </div>
            <Button
              onClick={handleCommentSubmit}
              disabled={(!commentText.trim() && !selectedSticker) || isSubmittingComment}
            >
              {isSubmittingComment ? "작성 중..." : "댓글 작성"}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Comment List */}
        <div className="space-y-6">
          {isLoadingComments ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground text-sm">댓글을 불러오는 중...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground text-sm">아직 댓글이 없습니다.</p>
            </div>
          ) : (
            comments.map((comment) => (
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
              />
            ))
          )}
        </div>
      </div>
    </Card>
  )
}
