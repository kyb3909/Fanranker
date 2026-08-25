"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "@/components/ui/app-link"
import { Heart, MessageCircle, X, Loader2 } from "lucide-react"
import { trackEvent } from "@/lib/analytics/events"

export interface SnackCard {
  id: string
  title: string
  image: string
  nickname: string
  voteCount: number
  commentCount: number
  createdAt: string
}

/**
 * 떡밥 피드 — 풀스크린 세로 스와이프 (틱톡 문법).
 * CSS scroll-snap 으로 카드 단위 스냅, 끝에 가까워지면 다음 페이지 로드.
 * 하트는 비로그인도 가능한 로컬 반응 (서버 반영 없음 — 도파민용 즉각 피드백).
 */
export function SnackFeedClient({
  initialCards,
  initialCursor,
}: {
  initialCards: SnackCard[]
  initialCursor: string | null
}) {
  const [cards, setCards] = useState(initialCards)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const seenRef = useRef(0)

  // 로컬 하트 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem("snack-likes")
      if (saved) setLiked(JSON.parse(saved))
    } catch {
      // 무시
    }
  }, [])

  const toggleLike = useCallback((id: string) => {
    setLiked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem("snack-likes", JSON.stringify(next))
      } catch {
        // 무시
      }
      return next
    })
  }, [])

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    try {
      const res = await fetch(`/api/feed/snack?before=${encodeURIComponent(cursor)}`)
      const d = (await res.json()) as { cards: SnackCard[]; nextCursor: string | null }
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        return [...prev, ...d.cards.filter((c) => !seen.has(c.id))]
      })
      setCursor(d.nextCursor)
    } finally {
      setLoading(false)
    }
  }, [cursor, loading])

  // 스크롤 위치 기반: 끝 4장 전에 미리 로드 + 본 카드 수 계측
  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const idx = Math.round(el.scrollTop / el.clientHeight)
    if (idx > seenRef.current) {
      seenRef.current = idx
      if (idx > 0 && idx % 10 === 0) {
        trackEvent({ name: "snack_feed_depth", params: { depth: idx } })
      }
    }
    if (idx >= cards.length - 4) void loadMore()
  }, [cards.length, loadMore])

  useEffect(() => {
    trackEvent({ name: "snack_feed_open", params: {} })
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* 상단 바 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pt-3 pb-8">
        <span className="text-[16px] font-bold text-white">🍿 떡밥 피드</span>
        <Link
          href="/"
          className="pointer-events-auto rounded-full bg-white/15 p-2 text-white backdrop-blur-sm"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </Link>
      </div>

      {/* 카드 스트림 */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain"
      >
        {cards.map((card) => (
          <section
            key={card.id}
            className="relative flex h-full w-full snap-start snap-always items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.image}
              alt={card.title}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
            {/* 하단 정보 오버레이 */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pt-16 pb-6">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-white/70">{card.nickname}</p>
                  <Link
                    href={`/post/${card.id}?utm_source=snack`}
                    className="mt-0.5 line-clamp-2 block text-[16px] leading-snug font-bold text-white"
                    onClick={() =>
                      trackEvent({ name: "snack_card_open_post", params: { post_id: card.id } })
                    }
                  >
                    {card.title}
                  </Link>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => toggleLike(card.id)}
                    className="flex flex-col items-center text-white"
                    aria-label="하트"
                  >
                    <Heart
                      className={`h-7 w-7 transition-transform active:scale-125 ${
                        liked[card.id] ? "fill-rose-500 text-rose-500" : ""
                      }`}
                    />
                    <span className="mt-0.5 text-[12px] tabular-nums">
                      {card.voteCount + (liked[card.id] ? 1 : 0)}
                    </span>
                  </button>
                  <Link
                    href={`/post/${card.id}?utm_source=snack#comments`}
                    className="flex flex-col items-center text-white"
                    aria-label="댓글"
                  >
                    <MessageCircle className="h-7 w-7" />
                    <span className="mt-0.5 text-[12px] tabular-nums">{card.commentCount}</span>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* 끝 카드 */}
        <section className="flex h-full w-full snap-start flex-col items-center justify-center gap-3 text-white/80">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : cursor ? (
            <p className="text-sm">더 불러오는 중...</p>
          ) : (
            <>
              <p className="text-lg font-bold">오늘의 떡밥 끝!</p>
              <p className="text-sm text-white/60">매시간 새 떡밥이 채워집니다</p>
              <Link
                href="/"
                className="mt-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black"
              >
                담벼락 구경 가기
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
