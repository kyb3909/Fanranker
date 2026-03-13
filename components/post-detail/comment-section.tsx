"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

  // SSR 데이터가 있으면 즉시 transform하여 초기값으로 사용
  const initialComments = initialData
    ? transformComments(initialData.comments, initialData.profiles, initialData.equippedTitles)
    : []

  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [isLoadingComments, setIsLoadingComments] = useState(!initialData)

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

  // @멘션 스티커 자동완성
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionResults, setMentionResults] = useState<
    { id: string; name: string; image_url: string }[]
  >([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const hasInitialData = useRef(!!initialData)
  useEffect(() => {
    // SSR에서 이미 댓글을 가져왔으면 첫 fetch 스킵
    if (hasInitialData.current) {
      hasInitialData.current = false
      onCommentCountChange?.(countAllComments(initialComments))
      return
    }
    setIsLoadingComments(true)
    reloadComments().finally(() => setIsLoadingComments(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadComments])

  // @멘션 스티커 검색
  const searchStickers = useCallback(async (query: string) => {
    if (!query) {
      setMentionResults([])
      return
    }
    setMentionLoading(true)
    try {
      const res = await fetch(`/api/stickers/my?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.stickers) {
        setMentionResults(
          data.stickers.map((s: { id: string; name: string; image_url: string }) => ({
            id: s.id,
            name: s.name,
            image_url: s.image_url,
          }))
        )
      }
    } catch {
      setMentionResults([])
    } finally {
      setMentionLoading(false)
    }
  }, [])

  const handleTextChange = useCallback(
    (value: string) => {
      setCommentText(value)

      // @ 감지: 커서 위치에서 가장 가까운 @를 찾음
      const textarea = textareaRef.current
      if (!textarea) return
      const cursorPos = textarea.selectionStart
      const textBeforeCursor = value.slice(0, cursorPos)

      // 마지막 @를 찾되, 그 앞이 공백이거나 줄 시작이어야 함
      const mentionMatch = textBeforeCursor.match(/(^|[\s])@([^\s@]*)$/)
      if (mentionMatch) {
        const query = mentionMatch[2]
        setMentionQuery(query)
        setMentionIndex(0)
        if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current)
        if (query.length >= 1) {
          mentionDebounceRef.current = setTimeout(() => searchStickers(query), 200)
        } else {
          setMentionResults([])
        }
      } else {
        setMentionQuery(null)
        setMentionResults([])
      }
    },
    [searchStickers]
  )

  const selectMentionSticker = useCallback(
    (sticker: { id: string; name: string; image_url: string }) => {
      setSelectedSticker(sticker)
      setMentionQuery(null)
      setMentionResults([])

      // @키워드 부분을 텍스트에서 제거
      const textarea = textareaRef.current
      if (textarea) {
        const cursorPos = textarea.selectionStart
        const textBeforeCursor = commentText.slice(0, cursorPos)
        const match = textBeforeCursor.match(/(^|[\s])@[^\s@]*$/)
        if (match) {
          const start = textBeforeCursor.lastIndexOf("@")
          const newText = commentText.slice(0, start) + commentText.slice(cursorPos)
          setCommentText(newText.trimStart())
        }
      }
    },
    [commentText]
  )

  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mentionQuery === null || mentionResults.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionResults.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length)
      } else if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        selectMentionSticker(mentionResults[mentionIndex])
      } else if (e.key === "Escape") {
        setMentionQuery(null)
        setMentionResults([])
      }
    },
    [mentionQuery, mentionResults, mentionIndex, selectMentionSticker]
  )

  // cleanup debounce
  useEffect(() => {
    return () => {
      if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current)
    }
  }, [])

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
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="댓글을 입력하세요... (@스티커이름으로 스티커 검색)"
              className="min-h-[100px] resize-none"
              value={commentText}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (mentionQuery !== null && mentionResults.length > 0) {
                  handleMentionKeyDown(e)
                  return
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleCommentSubmit()
                }
              }}
            />
            {/* @멘션 스티커 자동완성 드롭다운 */}
            {mentionQuery !== null && (mentionLoading || mentionResults.length > 0) && (
              <div
                ref={mentionRef}
                className="border-border bg-card absolute right-0 bottom-0 left-0 z-50 translate-y-full rounded-lg border shadow-xl"
              >
                {mentionLoading ? (
                  <div className="text-muted-foreground px-3 py-3 text-center text-xs">
                    검색 중...
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto py-1">
                    {mentionResults.map((sticker, i) => (
                      <button
                        key={sticker.id}
                        onClick={() => selectMentionSticker(sticker)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          i === mentionIndex ? "bg-amber-500/10" : "hover:bg-muted/60"
                        }`}
                      >
                        <img
                          src={sticker.image_url}
                          alt={sticker.name}
                          className="h-10 w-10 rounded object-contain"
                        />
                        <span className="text-foreground text-sm font-medium">{sticker.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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
