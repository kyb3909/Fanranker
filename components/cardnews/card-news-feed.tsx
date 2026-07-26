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

/** 상단 태그 칩 공통 스타일 — frosted 다크 필 (BBC Sport/OneFootball 태그 문법) */
const chipStyle: React.CSSProperties = {
  height: 24,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.02em",
  background: "rgba(12,11,15,.5)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,.16)",
  color: "rgba(255,255,255,.94)",
}

/** 출처 칩 — 오피셜=버건디 필, 1티어=골드 별, 언론=플레인 */
function SourceChip({ source }: { source: string }) {
  const tier = badgeTier(source)
  if (tier === "official") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          ...chipStyle,
          background: "rgba(159,18,57,.88)",
          border: "1px solid rgba(255,255,255,.24)",
        }}
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
        오피셜
      </span>
    )
  }
  if (tier === "tier1") {
    return (
      <span className="inline-flex items-center gap-1" style={chipStyle}>
        <Star className="h-2.5 w-2.5 fill-current" style={{ color: "#FFD96B" }} />
        {source}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center"
      style={{ ...chipStyle, color: "rgba(255,255,255,.78)" }}
    >
      {source}
    </span>
  )
}

/** 팀/말머리 칩 — 말머리 색 dot + 이름 */
function FlairChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={chipStyle}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color || "#9F1239" }}
      />
      {name}
    </span>
  )
}

/* 브라우저 네이티브 FaceDetector (Chromium 계열) — 없거나 실패하면 상단 30% 크롭 fallback */
interface DetectedFaceBox {
  boundingBox: { x: number; y: number; width: number; height: number }
}
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (el: HTMLImageElement) => Promise<DetectedFaceBox[]>
}

const clampPct = (v: number) => Math.min(80, Math.max(20, v))

/** 얼굴 중심 object-position — 감지 성공 시에만 값 반환, 나머지는 null(fallback 유지) */
function useFaceFocus(imageUrl: string | null): string | null {
  const [pos, setPos] = useState<string | null>(null)

  useEffect(() => {
    if (!imageUrl) return
    const FD = (window as { FaceDetector?: FaceDetectorCtor }).FaceDetector
    if (!FD) return
    let cancelled = false
    // 화면의 <img>에 crossOrigin 을 걸면 CORS 미허용 호스트에서 이미지 자체가 깨짐
    // → 별도 프로브 이미지로만 감지 시도 (실패해도 화면 영향 없음)
    const probe = new Image()
    probe.crossOrigin = "anonymous"
    probe.src = imageUrl
    probe.onload = async () => {
      try {
        const faces = await new FD({ fastMode: true, maxDetectedFaces: 4 }).detect(probe)
        if (cancelled || faces.length === 0 || !probe.naturalWidth) return
        const cx =
          faces.reduce((s, f) => s + f.boundingBox.x + f.boundingBox.width / 2, 0) / faces.length
        const cy =
          faces.reduce((s, f) => s + f.boundingBox.y + f.boundingBox.height / 2, 0) / faces.length
        setPos(
          `${clampPct((cx / probe.naturalWidth) * 100)}% ${clampPct((cy / probe.naturalHeight) * 100)}%`
        )
      } catch {
        // CORS/감지 실패 — fallback 유지
      }
    }
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  return pos
}

/**
 * eased scrim — 투명→어두움을 8스톱으로 완만하게 (하드 엣지 제거).
 * cubic ease-in 근사 스톱. 블러 없음 (mask+blur 는 bloom 아티팩트를 만듦).
 */
const SCRIM =
  "linear-gradient(to top, rgba(9,8,11,.86) 0%, rgba(9,8,11,.83) 8%, rgba(9,8,11,.76) 18%, rgba(9,8,11,.63) 32%, rgba(9,8,11,.46) 46%, rgba(9,8,11,.28) 62%, rgba(9,8,11,.12) 78%, rgba(9,8,11,.03) 90%, rgba(9,8,11,0) 100%)"

/** 고스트 액션 공통 — 필 배경 없이 아이콘+숫자, before 로 히트 영역 보정 */
const ghostAction =
  "before:content-[''] before:absolute before:-inset-2.5 relative inline-flex items-center gap-1 text-[12.5px] font-semibold transition-colors"

function NewsCard({ card, eager }: { card: CardNewsItem; eager: boolean }) {
  const [liked, setLiked] = useState(false)
  const faceFocus = useFaceFocus(card.image)

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
      className="group relative h-[264px] overflow-hidden rounded-2xl sm:h-[320px]"
      style={{ boxShadow: "0 2px 8px rgba(23,20,15,.10)" }}
    >
      {/* 배경: 뉴스 이미지 or 회색 플레이스홀더. hover 시 미세 줌 (데스크톱 폴리시) */}
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt=""
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          style={{ objectPosition: faceFocus ?? "50% 30%" }}
        />
      ) : (
        <div className="absolute inset-0 bg-gray-300" />
      )}

      {/* eased scrim — 하단 62% 를 부드럽게 덮음 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
        style={{ height: "62%", background: SCRIM }}
      />
      {/* 상단 미세 음영 — 태그 칩 가독성용 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
        style={{
          height: "24%",
          background: "linear-gradient(to bottom, rgba(9,8,11,.36), rgba(9,8,11,0))",
        }}
      />

      {/* 카드 전체 탭 영역 → 상세 */}
      <Link
        href={`/post/${card.id}?utm_source=cardnews`}
        className="absolute inset-0 z-[2]"
        aria-label={card.title}
        onClick={() =>
          trackEvent({ name: "cardnews_card_open_post", params: { post_id: card.id } })
        }
      />

      {/* 상단 태그 칩 — 출처 + 팀/말머리 */}
      {(card.source || card.flair) && (
        <div className="pointer-events-none absolute top-3 left-3 z-[3] flex flex-wrap items-center gap-1.5">
          {card.source && <SourceChip source={card.source} />}
          {card.flair && <FlairChip name={card.flair.name} color={card.flair.color} />}
        </div>
      )}

      {/* 하단 텍스트 블록 — 제목 / 메타 / 베스트 댓글 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] px-4 pb-3.5">
        <h2
          className="line-clamp-2 text-white"
          style={{
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1.32,
            letterSpacing: "-0.02em",
          }}
        >
          {card.title}
        </h2>

        {/* 메타 줄 — 고스트 아이콘 액션 + 시간 */}
        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={toggleLike}
            className={`${ghostAction} pointer-events-auto ${
              liked ? "text-rose-400" : "text-white/85 hover:text-white"
            }`}
            aria-label="좋아요"
            aria-pressed={liked}
          >
            <Heart
              className={`h-[15px] w-[15px] transition-transform active:scale-125 ${liked ? "fill-current" : ""}`}
            />
            <span className="tabular-nums">{card.voteCount + (liked ? 1 : 0)}</span>
          </button>
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className={`${ghostAction} pointer-events-auto text-white/85 hover:text-white`}
            aria-label="댓글"
          >
            <MessageCircle className="h-[15px] w-[15px]" />
            <span className="tabular-nums">{card.commentCount}</span>
          </Link>
          <span
            className="ml-auto text-[12px] font-medium"
            style={{ color: "rgba(255,255,255,.6)" }}
            suppressHydrationWarning
          >
            {formatRelativeTime(new Date(card.createdAt))}
          </span>
        </div>

        {/* 베스트 댓글 — 박스 없이 헤어라인 위 한 줄 인용 */}
        {card.bestComment && card.commentCount > 0 && (
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className="pointer-events-auto mt-2.5 flex items-center gap-1.5 pt-2.5"
            style={{ borderTop: "1px solid rgba(255,255,255,.14)" }}
          >
            <span
              className="shrink-0 text-[11px] font-extrabold"
              style={{ color: "rgba(255,255,255,.55)" }}
            >
              BEST
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[12.5px]"
              style={{ color: "rgba(255,255,255,.85)" }}
            >
              {card.bestComment}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
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
