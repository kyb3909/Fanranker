"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useUser } from "@clerk/nextjs"
import { ArrowUpDown } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { CommentItem } from "./comment-item"
import { CommentForm } from "./comment-form"
import { countAllComments, transformComments } from "./post-detail-types"
import type { Comment } from "./post-detail-types"
import { useBlockedUsers } from "@/hooks/use-blocked-users"

interface InitialData {
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

interface CommentSectionProps {
  postId: string | number
  onCommentCountChange?: (count: number) => void
  initialData?: InitialData
}

export function CommentSection({ postId, onCommentCountChange, initialData }: CommentSectionProps) {
  const { user } = useUser()
  const { isBlocked, toggleBlock } = useBlockedUsers()

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
    } catch {
      updateComments([])
    }
  }, [postId, updateComments])

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
    sticker: { id: string; name: string; image_url: string } | null
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

  return (
    <div
      className="rounded-lg"
      style={{
        background: "var(--wc-card)",
        boxShadow: "var(--wc-shadow-1)",
      }}
    >
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="wc-sec-eb">COMMENTS</div>
            <h3
              className="font-black tracking-tight"
              style={{
                fontSize: "clamp(18px, 2.5vw, 22px)",
                color: "var(--wc-ink)",
                letterSpacing: "-0.02em",
              }}
            >
              댓글 <span className="tabular-nums">{countAllComments(comments)}</span>개
            </h3>
          </div>
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
