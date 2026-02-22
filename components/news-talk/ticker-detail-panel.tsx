'use client'

import { useState, useRef, useEffect } from 'react'
import { X, ThumbsUp, MessageSquare, Share2, Users, Send, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import type { TalkBoardItem, ItemDetail, Comment } from './news-talk-types'
import { NEWS_DETAILS, getDefaultComments } from './news-talk-types'

interface TickerDetailPanelProps {
  item: TalkBoardItem
  isOpen: boolean
  onClose: () => void
}

export function TickerDetailPanel({ item, isOpen, onClose }: TickerDetailPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [inputValue, setInputValue] = useState('')
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setComments(getDefaultComments(item.id))
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, item.id])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const handleSubmit = () => {
    const text = inputValue.trim()
    if (!text) return
    const newComment: Comment = {
      id: `new-${Date.now()}`,
      author: '나',
      content: text,
      timestamp: '방금 전',
      likes: 0,
      isLiked: false,
    }
    setComments(prev => [newComment, ...prev])
    setInputValue('')
  }

  const handleLike = (commentId: string) => {
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? c.likes - 1 : c.likes + 1 }
        : c
    ))
  }

  if (!isOpen) return null

  const details: ItemDetail | undefined = item.detail || NEWS_DETAILS[item.id]

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="w-full sm:max-w-[600px] max-h-[85vh] sm:max-h-[80vh] bg-card sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden shadow-2xl border border-border">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-border bg-primary/5 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-4 h-4" />
              <span className="text-[13px] font-medium">{details?.participants || 0}명 참여</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-[16px] font-bold text-foreground leading-snug">{item.text}</h2>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-background">
          {/* 뉴스 카드 */}
          {details && (
            <div className="mx-4 mt-4 mb-3 p-5 bg-card rounded-xl border border-border">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[12px] font-semibold text-primary">{details.source}</span>
                {details.originalTitle && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[300px]" title={details.originalTitle}>
                    · {details.originalTitle}
                  </span>
                )}
              </div>

              {/* 미디어: YouTube 예고편 임베드 */}
              {details.mediaType === 'youtube' && details.sourceUrl && (() => {
                const ytMatch = details.sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
                return ytMatch ? (
                  <div className="mb-4 rounded-lg overflow-hidden aspect-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : null
              })()}

              {/* 미디어: 포스터/이미지 (원본 해상도) */}
              {details.mediaType === 'image' && (details.sourceUrl || details.thumbnailUrl) && (
                <div className="mb-4 rounded-lg overflow-hidden bg-black/5 relative" style={{ minHeight: 200 }}>
                  <Image
                    src={(details.sourceUrl || details.thumbnailUrl!).replace(/^http:\/\//, 'https://')}
                    alt={item.text || '뉴스 이미지'}
                    fill
                    className="object-contain"
                    unoptimized
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}

              {/* 기사 썸네일 */}
              {details.mediaType !== 'youtube' && details.mediaType !== 'image' && details.thumbnailUrl && (
                <div className="mb-4 rounded-lg overflow-hidden relative" style={{ minHeight: 180 }}>
                  <Image
                    src={details.thumbnailUrl.replace(/^http:\/\//, 'https://')}
                    alt={item.text || '기사 썸네일'}
                    fill
                    className="object-cover"
                    unoptimized
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}

              <ul className="space-y-3">
                {details.summary.map((line, i) => (
                  <li key={`summary-${item.id}-${i}`} className="flex gap-3 text-[14px] text-foreground leading-relaxed">
                    <span className="text-primary/60 shrink-0 font-bold text-[13px] mt-0.5">{i + 1}.</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-border">
                <a href={details.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-primary hover:text-primary/80 transition-colors font-semibold">
                  {details.source} 원문 &rarr;
                </a>
              </div>
            </div>
          )}

          {/* 반응 바 */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-border">
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <ThumbsUp className="w-4 h-4" />
              <span className="text-[13px] font-medium">좋아요</span>
            </button>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Share2 className="w-4 h-4" />
              <span className="text-[13px] font-medium">공유</span>
            </button>
            <span className="ml-auto text-[13px] text-muted-foreground font-medium">
              댓글 {comments.length}개
            </span>
          </div>

          {/* 댓글 목록 */}
          <div className="divide-y divide-border/50">
            {comments.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-[14px] text-muted-foreground">첫 번째 댓글을 남겨보세요</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-bold text-primary shrink-0">
                      {comment.author[0]}
                    </div>
                    <span className="text-[14px] font-semibold text-foreground">{comment.author}</span>
                    <span className="text-[12px] text-muted-foreground">{comment.timestamp}</span>
                  </div>
                  <p className="text-[14px] text-foreground leading-relaxed pl-[42px]">
                    {comment.content}
                  </p>
                  <div className="flex items-center gap-4 mt-2.5 pl-[42px]">
                    <button
                      onClick={() => handleLike(comment.id)}
                      className={`flex items-center gap-1 text-[12px] font-medium transition-colors ${
                        comment.isLiked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ChevronUp className="w-4 h-4" />
                      <span>{comment.likes}</span>
                    </button>
                    <button className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                      답글
                    </button>
                  </div>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="shrink-0 px-4 py-3.5 border-t border-border bg-card">
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }}}
              placeholder="댓글을 입력하세요..."
              className="flex-1 h-10 px-4 bg-secondary text-[14px] text-foreground placeholder:text-muted-foreground rounded-full border border-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-border"
            />
            <Button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
