"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "@/components/ui/app-link"
import { Heart, MessageCircle, ChevronRight, Check, Star, Loader2 } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import { trackEvent } from "@/lib/analytics/events"
import type { CardNewsItem } from "@/lib/feed/cardnews"

/**
 * 카드뉴스 홈 피드 — 오버레이 카드형 (세로 스크롤, 풀스크린 스와이프 아님).
 * 카드 = 이미지 한 덩어리 + 하단 음영 위 제목/액션/베스트 댓글.
 * 좋아요는 떡밥 피드와 동일한 비로그인 로컬 반응 (서버 반영 없음).
 * 폭은 컨테이너 100% — 모바일 390px, 데스크톱 중앙 피드 컬럼 양쪽 대응.
 */

const BURGUNDY = "#9F1239"
const TIER1_SOURCES = ["로마노", "온스테인", "romano", "ornstein", "파브리지오", "fabrizio"]

type BadgeTier = "official" | "tier1" | "media"

function badgeTier(source: string): BadgeTier {
  const s = source.toLowerCase()
  if (s.includes("오피셜") || s.includes("official")) return "official"
  if (TIER1_SOURCES.some((t) => s.includes(t))) return "tier1"
  return "media"
}

function SourceBadge({ source }: { source: string }) {
  const tier = badgeTier(source)
  const base: React.CSSProperties = {
    padding: "4px 9px",
    borderRadius: 6,
    boxShadow: "0 2px 8px rgba(0,0,0,.25)",
    fontSize: 11,
    fontWeight: 800,
  }
  if (tier === "official") {
    return (
      <span
        className="pointer-events-none absolute top-3 left-3 z-[2] inline-flex items-center gap-1 text-white"
        style={{ ...base, background: BURGUNDY }}
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
        {source}
      </span>
    )
  }
  if (tier === "tier1") {
    return (
      <span
        className="pointer-events-none absolute top-3 left-3 z-[2] inline-flex items-center gap-1"
        style={{ ...base, background: "#fff", color: BURGUNDY }}
      >
        <Star className="h-3 w-3 fill-current" />
        {source}
      </span>
    )
  }
  return (
    <span
      className="pointer-events-none absolute top-3 left-3 z-[2] inline-flex items-center"
      style={{ ...base, background: "rgba(255,255,255,.92)", color: "#3A3F45" }}
    >
      {source}
    </span>
  )
}

/** 반투명 필 버튼 공통 클래스 — 36px 높이 + before로 히트 영역 44px 보정 */
const pillClass =
  "before:content-[''] before:absolute before:-inset-1 relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white backdrop-blur-[6px] transition-colors"

function NewsCard({ card, eager }: { card: CardNewsItem; eager: boolean }) {
  const [liked, setLiked] = useState(false)

  // 로컬 하트 복원 (떡밥 피드와 동일 방식, 키만 분리)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cardnews-likes") || "{}")
      if (saved[card.id]) setLiked(true)
    } catch {
      // 무시
    }
  }, [card.id])

  const toggleLike = useCallback(() => {
    setLiked((prev) => {
      const next = !prev
      try {
        const saved = JSON.parse(localStorage.getItem("cardnews-likes") || "{}")
        if (next) saved[card.id] = true
        else delete saved[card.id]
        localStorage.setItem("cardnews-likes", JSON.stringify(saved))
      } catch {
        // 무시
      }
      return next
    })
  }, [card.id])

  return (
    <article
      className="relative h-[264px] overflow-hidden rounded-2xl sm:h-[320px]"
      style={{ boxShadow: "0 1px 3px rgba(23,20,15,.08)" }}
    >
      {/* 배경: 뉴스 이미지 or 회색 플레이스홀더 */}
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt=""
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gray-300" />
      )}
      {/* 하단 음영 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(12,8,10,.55) 68%, rgba(12,8,10,.88) 100%)",
        }}
      />

      {/* 카드 전체 탭 영역 → 상세 */}
      <Link
        href={`/post/${card.id}?utm_source=cardnews`}
        className="absolute inset-0 z-[1]"
        aria-label={card.title}
        onClick={() =>
          trackEvent({ name: "cardnews_card_open_post", params: { post_id: card.id } })
        }
      />

      {card.source && <SourceBadge source={card.source} />}

      {/* 하단 콘텐츠 — 버튼/댓글바만 pointer-events 살림 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-3.5">
        <h2
          className="line-clamp-2 text-white"
          style={{
            fontSize: 17.5,
            fontWeight: 750,
            lineHeight: 1.36,
            letterSpacing: "-0.015em",
            textShadow: "0 1px 10px rgba(0,0,0,.35)",
          }}
        >
          {card.title}
        </h2>

        {/* 액션 줄 */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLike}
            className={`${pillClass} pointer-events-auto bg-white/[.18] hover:bg-white/30 active:bg-white/30`}
            aria-label="좋아요"
            aria-pressed={liked}
          >
            <Heart
              className={`h-4 w-4 transition-transform active:scale-125 ${
                liked ? "fill-rose-400 text-rose-400" : ""
              }`}
            />
            <span className="tabular-nums">{card.voteCount + (liked ? 1 : 0)}</span>
          </button>
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className={`${pillClass} pointer-events-auto bg-white/[.18] hover:bg-white/30 active:bg-white/30`}
            aria-label="댓글"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="tabular-nums">{card.commentCount}</span>
          </Link>
          <span
            className="ml-auto text-[12px]"
            style={{ color: "rgba(255,255,255,.78)" }}
            suppressHydrationWarning
          >
            {formatRelativeTime(new Date(card.createdAt))}
          </span>
        </div>

        {/* 베스트 댓글 미리보기 — 댓글 있는 카드에만 */}
        {card.bestComment && card.commentCount > 0 && (
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className="pointer-events-auto mt-2.5 flex items-center gap-2 rounded-[10px] backdrop-blur-[6px]"
            style={{ background: "rgba(255,255,255,.14)", padding: "8px 11px" }}
          >
            <span
              className="shrink-0 rounded bg-white px-1.5 py-0.5"
              style={{ color: BURGUNDY, fontSize: 10.5, fontWeight: 800 }}
            >
              베스트
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[13px]"
              style={{ color: "rgba(255,255,255,.92)" }}
            >
              {card.bestComment}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/70" />
          </Link>
        )}
      </div>
    </article>
  )
}

export function CardNewsFeed({
  initialCards,
  initialCursor,
}: {
  initialCards: CardNewsItem[]
  initialCursor: string | null
}) {
  const [cards, setCards] = useState(initialCards)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    try {
      const res = await fetch(`/api/feed/cardnews?before=${encodeURIComponent(cursor)}`)
      const d = (await res.json()) as { cards: CardNewsItem[]; nextCursor: string | null }
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        return [...prev, ...d.cards.filter((c) => !seen.has(c.id))]
      })
      setCursor(d.nextCursor)
    } finally {
      setLoading(false)
    }
  }, [cursor, loading])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: "600px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  useEffect(() => {
    trackEvent({ name: "cardnews_feed_open", params: {} })
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {cards.map((card, i) => (
        <NewsCard key={card.id} card={card} eager={i < 2} />
      ))}
      <div ref={sentinelRef} className="flex h-10 items-center justify-center">
        {loading && <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />}
        {!cursor && !loading && (
          <p className="text-muted-foreground py-2 text-[13px]">오늘의 뉴스 끝!</p>
        )}
      </div>
    </div>
  )
}
