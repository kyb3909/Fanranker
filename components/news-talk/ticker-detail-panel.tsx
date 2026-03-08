"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, ThumbsUp, MessageSquare, Share2, Users, Send, ChevronUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { useUser } from "@clerk/nextjs"
import type { TalkBoardItem, ItemDetail } from "./news-talk-types"
import { NEWS_DETAILS } from "./news-talk-types"

interface TickerComment {
  id: string
  user_id: string
  nickname: string
  content: string
  likes: number
  created_at: string
}

interface TickerDetailPanelProps {
  item: TalkBoardItem
  isOpen: boolean
  onClose: () => void
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "방금 전"
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

/** Extract numeric DB id from "ticker-123" format */
function extractTickerId(itemId: string): string | null {
  const match = itemId.match(/^ticker-(\d+)$/)
  return match ? match[1] : null
}

export function TickerDetailPanel({ item, isOpen, onClose }: TickerDetailPanelProps) {
  const { user } = useUser()
  const [comments, setComments] = useState<TickerComment[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const tickerId = extractTickerId(item.id)

  const fetchComments = useCallback(async () => {
    if (!tickerId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/ticker/${tickerId}/comments`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments || [])
      }
    } catch {
      // 조회 실패 시 빈 배열 유지
    } finally {
      setIsLoading(false)
    }
  }, [tickerId])

  useEffect(() => {
    if (isOpen) {
      fetchComments()
      document.body.style.overflow = "hidden"
    } else {
      setComments([])
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen, fetchComments])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKey)
      return () => document.removeEventListener("keydown", handleKey)
    }
  }, [isOpen, onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const handleSubmit = async () => {
    const text = inputValue.trim()
    if (!text || !tickerId || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/ticker/${tickerId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      })

      if (res.ok) {
        const newComment: TickerComment = await res.json()
        setComments((prev) => [newComment, ...prev])
        setInputValue("")
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.error || "댓글 작성에 실패했습니다.")
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const details: ItemDetail | undefined = item.detail || NEWS_DETAILS[item.id]
  const isRealTicker = !!tickerId

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={handleOverlayClick}
    >
      <div className="bg-card border-border flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border shadow-2xl sm:max-h-[80vh] sm:max-w-[600px] sm:rounded-2xl">
        {/* 헤더 */}
        <div className="border-border bg-primary/5 shrink-0 border-b px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span className="text-[13px] font-medium">{details?.participants || 0}명 참여</span>
            </div>
            <button
              onClick={onClose}
              className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-full p-1.5 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <h2 className="text-foreground text-[16px] leading-snug font-bold">{item.text}</h2>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="bg-background min-h-0 flex-1 overflow-y-auto">
          {/* 뉴스 카드 */}
          {details && (
            <div className="bg-card border-border mx-4 mt-4 mb-3 rounded-xl border p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-primary text-[12px] font-semibold">{details.source}</span>
                {details.originalTitle && (
                  <span
                    className="text-muted-foreground max-w-[300px] truncate text-[11px]"
                    title={details.originalTitle}
                  >
                    · {details.originalTitle}
                  </span>
                )}
              </div>

              {/* 미디어: YouTube 예고편 임베드 */}
              {details.mediaType === "youtube" &&
                details.sourceUrl &&
                (() => {
                  const ytMatch = details.sourceUrl.match(
                    /(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
                  )
                  return ytMatch ? (
                    <div className="mb-4 aspect-video overflow-hidden rounded-lg">
                      <iframe
                        src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : null
                })()}

              {/* 미디어: 포스터/이미지 (원본 해상도) */}
              {details.mediaType === "image" && (details.sourceUrl || details.thumbnailUrl) && (
                <div
                  className="relative mb-4 overflow-hidden rounded-lg bg-black/5"
                  style={{ minHeight: 200 }}
                >
                  <Image
                    src={(details.sourceUrl || details.thumbnailUrl!).replace(
                      /^http:\/\//,
                      "https://"
                    )}
                    alt={item.text || "뉴스 이미지"}
                    fill
                    className="object-contain"
                    unoptimized
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
              )}

              {/* 기사 썸네일 */}
              {details.mediaType !== "youtube" &&
                details.mediaType !== "image" &&
                details.thumbnailUrl && (
                  <div
                    className="relative mb-4 overflow-hidden rounded-lg"
                    style={{ minHeight: 180 }}
                  >
                    <Image
                      src={details.thumbnailUrl.replace(/^http:\/\//, "https://")}
                      alt={item.text || "기사 썸네일"}
                      fill
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                      }}
                    />
                  </div>
                )}

              <ul className="space-y-3">
                {details.summary.map((line, i) => (
                  <li
                    key={`summary-${item.id}-${i}`}
                    className="text-foreground flex gap-3 text-[14px] leading-relaxed"
                  >
                    <span className="text-primary/60 mt-0.5 shrink-0 text-[13px] font-bold">
                      {i + 1}.
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="border-border mt-4 border-t pt-3">
                <a
                  href={details.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 text-[13px] font-semibold transition-colors"
                >
                  {details.source} 원문 &rarr;
                </a>
              </div>
            </div>
          )}

          {/* 반응 바 */}
          <div className="border-border flex items-center gap-4 border-b px-5 py-3">
            <button className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <ThumbsUp className="h-4 w-4" />
              <span className="text-[13px] font-medium">좋아요</span>
            </button>
            <button className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <Share2 className="h-4 w-4" />
              <span className="text-[13px] font-medium">공유</span>
            </button>
            <span className="text-muted-foreground ml-auto text-[13px] font-medium">
              댓글 {comments.length}개
            </span>
          </div>

          {/* 댓글 목록 */}
          <div className="divide-border/50 divide-y">
            {isLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="text-muted-foreground/50 mx-auto mb-2 h-6 w-6 animate-spin" />
                <p className="text-muted-foreground text-[13px]">댓글 불러오는 중...</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="text-muted-foreground/30 mx-auto mb-3 h-10 w-10" />
                <p className="text-muted-foreground text-[14px]">첫 번째 댓글을 남겨보세요</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="hover:bg-muted/30 px-5 py-4 transition-colors">
                  <div className="mb-2 flex items-center gap-2.5">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
                      {comment.nickname[0]}
                    </div>
                    <span className="text-foreground text-[14px] font-semibold">
                      {comment.nickname}
                    </span>
                    <span className="text-muted-foreground text-[12px]">
                      {formatTimeAgo(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-foreground pl-[42px] text-[14px] leading-relaxed">
                    {comment.content}
                  </p>
                  <div className="mt-2.5 flex items-center gap-4 pl-[42px]">
                    <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[12px] font-medium transition-colors">
                      <ChevronUp className="h-4 w-4" />
                      <span>{comment.likes}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="border-border bg-card shrink-0 border-t px-4 py-3.5">
          {!user ? (
            <p className="text-muted-foreground py-1 text-center text-[13px]">
              댓글을 작성하려면 로그인이 필요합니다.
            </p>
          ) : !isRealTicker ? (
            <p className="text-muted-foreground py-1 text-center text-[13px]">
              목업 데이터에는 댓글을 작성할 수 없습니다.
            </p>
          ) : (
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="댓글을 입력하세요... (300자)"
                maxLength={300}
                disabled={isSubmitting}
                className="bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-ring focus:border-border h-10 flex-1 rounded-full border border-transparent px-4 text-[14px] focus:ring-2 focus:outline-none disabled:opacity-50"
              />
              <Button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isSubmitting}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
