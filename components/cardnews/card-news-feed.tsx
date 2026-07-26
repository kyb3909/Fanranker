"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "@/components/ui/app-link"
import {
  Heart,
  MessageCircle,
  ChevronRight,
  Check,
  Star,
  Loader2,
  Youtube,
  Instagram,
  Play,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import { trackEvent } from "@/lib/analytics/events"
import type { CardNewsItem } from "@/lib/feed/cardnews"

/**
 * 카드뉴스 홈 피드 — 에디토리얼 3단 위계 (Apple News 문법).
 * 히어로(오버레이) 1장 → 미디엄(흰 프레임 + 상단 이미지) 2장 → 컴팩트 리스트.
 * 오버레이는 톱뉴스 강조 전용, 나머지는 사이트 표면 토큰(wc-card)과 융화.
 * 좋아요는 떡밥 피드와 동일한 비로그인 로컬 반응 (서버 반영 없음).
 */

const BURGUNDY = "var(--wc-burgundy)"
const TIER1_SOURCES = ["로마노", "온스테인", "romano", "ornstein", "파브리지오", "fabrizio"]

type BadgeTier = "official" | "tier1" | "media"

function badgeTier(source: string): BadgeTier {
  const s = source.toLowerCase()
  if (s.includes("오피셜") || s.includes("official")) return "official"
  if (TIER1_SOURCES.some((t) => s.includes(t))) return "tier1"
  return "media"
}

/* ---------- 이미지 위 태그 칩 (히어로/미디엄 이미지 영역 공용) ---------- */

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

function SourceChip({ source }: { source: string }) {
  const tier = badgeTier(source)
  if (tier === "official") {
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          ...chipStyle,
          background: "color-mix(in srgb, var(--wc-burgundy) 88%, transparent)",
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

type MediaProvider = "youtube" | "instagram" | "x"

/** 플랫폼 뱃지 칩 — "누르면 영상/트윗 나온다" 기대 형성용 */
function PlatformChip({ provider }: { provider: MediaProvider }) {
  if (provider === "youtube") {
    return (
      <span className="inline-flex items-center gap-1" style={chipStyle}>
        <Youtube className="h-3.5 w-3.5" style={{ color: "#FF6B61" }} />
        YouTube
      </span>
    )
  }
  if (provider === "instagram") {
    return (
      <span className="inline-flex items-center gap-1" style={chipStyle}>
        <Instagram className="h-3 w-3" style={{ color: "#FF8FB0" }} />
        Instagram
      </span>
    )
  }
  return (
    <span className="inline-flex items-center" style={chipStyle}>
      <span className="text-[12px] leading-none font-black">𝕏</span>
    </span>
  )
}

/** 썸네일 없는 미디어 글의 배경 — 은은한 브랜드 톤 + 대형 아이콘 */
function MediaPlaceholder({ provider }: { provider: MediaProvider }) {
  if (provider === "instagram") {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #4F3B78 0%, #8E3B60 55%, #B85C38 100%)" }}
      >
        <Instagram className="h-12 w-12 text-white/35" />
      </div>
    )
  }
  if (provider === "x") {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: "#15181C" }}
      >
        <span className="text-6xl font-black text-white/25">𝕏</span>
      </div>
    )
  }
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: "#1A1416" }}
    >
      <Youtube className="h-12 w-12 text-white/30" />
    </div>
  )
}

/** 유튜브 lite embed 재생 버튼 — 탭 전엔 이미지 한 장, 탭하면 그 자리에서 iframe 재생 */
function PlayButton({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label="영상 재생"
      className="pointer-events-auto absolute top-1/2 left-1/2 z-[3] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform hover:scale-105"
      style={{
        background: "rgba(0,0,0,.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,.25)",
      }}
    >
      <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
    </button>
  )
}

function FlairChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={chipStyle}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color || BURGUNDY }}
      />
      {name}
    </span>
  )
}

/** 컴팩트 행 키커 — 흰 표면 위 텍스트 레이블 */
function CompactKicker({ card }: { card: CardNewsItem }) {
  const parts: React.ReactNode[] = []
  if (card.source) {
    const tier = badgeTier(card.source)
    parts.push(
      tier === "official" ? (
        <span key="src" className="inline-flex items-center gap-0.5" style={{ color: BURGUNDY }}>
          <Check className="h-3 w-3" strokeWidth={3.5} />
          오피셜
        </span>
      ) : tier === "tier1" ? (
        <span
          key="src"
          className="inline-flex items-center gap-0.5"
          style={{ color: "var(--wc-ink)" }}
        >
          <Star className="h-2.5 w-2.5 fill-current" style={{ color: "#E3A82B" }} />
          {card.source}
        </span>
      ) : (
        <span key="src" style={{ color: "var(--wc-mute)" }}>
          {card.source}
        </span>
      )
    )
  }
  if (card.flair) {
    parts.push(
      <span
        key="flair"
        className="inline-flex items-center gap-1"
        style={{ color: "var(--wc-mute)" }}
      >
        <span
          aria-hidden
          className="h-1 w-1 shrink-0 rounded-full"
          style={{ background: card.flair.color || BURGUNDY }}
        />
        {card.flair.name}
      </span>
    )
  }
  if (card.media) {
    parts.push(
      card.media.provider === "youtube" ? (
        <Youtube key="media" className="h-3.5 w-3.5" style={{ color: "#E53E3E" }} />
      ) : card.media.provider === "instagram" ? (
        <Instagram key="media" className="h-3 w-3" style={{ color: "#C13584" }} />
      ) : (
        <span
          key="media"
          className="text-[11px] leading-none font-black"
          style={{ color: "var(--wc-ink)" }}
        >
          𝕏
        </span>
      )
    )
  }
  if (parts.length === 0) return null
  return (
    <div
      className="mb-1 flex items-center gap-2 text-[11px] font-bold"
      style={{ letterSpacing: "0.03em" }}
    >
      {parts}
    </div>
  )
}

/* ---------- 공용 훅/스타일 ---------- */

/** eased scrim — 투명→어두움 9스톱 (하드 엣지 없음) */
const SCRIM =
  "linear-gradient(to top, rgba(9,8,11,.86) 0%, rgba(9,8,11,.83) 8%, rgba(9,8,11,.76) 18%, rgba(9,8,11,.63) 32%, rgba(9,8,11,.46) 46%, rgba(9,8,11,.28) 62%, rgba(9,8,11,.12) 78%, rgba(9,8,11,.03) 90%, rgba(9,8,11,0) 100%)"

/** 고스트 액션 — 아이콘+숫자, before 로 히트 영역 보정 */
const ghostAction =
  "before:content-[''] before:absolute before:-inset-2.5 relative inline-flex items-center gap-1 text-[12.5px] font-semibold transition-colors"

/** 로컬 좋아요 (비로그인 즉각 반응 — 떡밥 피드와 동일 방식, 키만 분리) */
function useLocalLike(id: string) {
  const [liked, setLiked] = useState(false)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cardnews-likes") || "{}")
      if (saved[id]) setLiked(true)
    } catch {
      // 무시
    }
  }, [id])
  const toggle = useCallback(() => {
    setLiked((prev) => {
      const next = !prev
      try {
        const saved = JSON.parse(localStorage.getItem("cardnews-likes") || "{}")
        if (next) saved[id] = true
        else delete saved[id]
        localStorage.setItem("cardnews-likes", JSON.stringify(saved))
      } catch {
        // 무시
      }
      return next
    })
  }, [id])
  return { liked, toggle }
}

/* 브라우저 네이티브 FaceDetector (Chromium 계열) — 없거나 실패하면 상단 30% 크롭 fallback */
interface DetectedFaceBox {
  boundingBox: { x: number; y: number; width: number; height: number }
}
type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect: (el: HTMLImageElement) => Promise<DetectedFaceBox[]>
}

const clampPct = (v: number) => Math.min(80, Math.max(20, v))

function useFaceFocus(imageUrl: string | null): string | null {
  const [pos, setPos] = useState<string | null>(null)

  useEffect(() => {
    if (!imageUrl) return
    const FD = (window as { FaceDetector?: FaceDetectorCtor }).FaceDetector
    if (!FD) return
    let cancelled = false
    // 화면 <img>에 crossOrigin 을 걸면 CORS 미허용 호스트에서 이미지가 깨짐
    // → 별도 프로브 이미지로만 감지 (실패해도 화면 무영향)
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

function openPost(id: string) {
  trackEvent({ name: "cardnews_card_open_post", params: { post_id: id } })
}

/* ---------- 1) 히어로 — 오버레이 카드 (톱뉴스 1장 전용) ---------- */

function HeroCard({ card, eager }: { card: CardNewsItem; eager: boolean }) {
  const { liked, toggle } = useLocalLike(card.id)
  const faceFocus = useFaceFocus(card.image)
  const [playing, setPlaying] = useState(false)
  const ytId = card.media?.provider === "youtube" ? card.media.videoId : undefined

  return (
    <article
      className="group relative h-[300px] overflow-hidden rounded-2xl sm:h-[340px]"
      style={{ boxShadow: "0 2px 8px rgba(23,20,15,.10)" }}
    >
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt=""
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          style={{ objectPosition: faceFocus ?? "50% 30%" }}
        />
      ) : card.media ? (
        <MediaPlaceholder provider={card.media.provider} />
      ) : (
        <div className="absolute inset-0 bg-gray-300" />
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
        style={{ height: "62%", background: SCRIM }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1]"
        style={{
          height: "24%",
          background: "linear-gradient(to bottom, rgba(9,8,11,.36), rgba(9,8,11,0))",
        }}
      />

      <Link
        href={`/post/${card.id}?utm_source=cardnews`}
        className="absolute inset-0 z-[2]"
        aria-label={card.title}
        onClick={() => openPost(card.id)}
      />

      {(card.source || card.flair || card.media) && (
        <div className="pointer-events-none absolute top-3 left-3 z-[3] flex flex-wrap items-center gap-1.5">
          {card.source && <SourceChip source={card.source} />}
          {card.flair && <FlairChip name={card.flair.name} color={card.flair.color} />}
          {card.media && <PlatformChip provider={card.media.provider} />}
        </div>
      )}

      {ytId && !playing && <PlayButton onPlay={() => setPlaying(true)} />}
      {ytId && playing && (
        <iframe
          className="absolute inset-0 z-[4] h-full w-full"
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title={card.title}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] px-4 pb-3.5">
        <h2
          className="line-clamp-2 text-white"
          style={{
            fontSize: 19,
            fontWeight: 800,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {card.title}
        </h2>

        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            className={`${ghostAction} pointer-events-auto ${
              liked ? "text-rose-400" : "text-white/85 hover:text-white"
            }`}
            aria-label="좋아요"
            aria-pressed={liked}
          >
            <Heart
              className={`h-[15px] w-[15px] transition-transform active:scale-125 ${liked ? "fill-current" : ""}`}
            />
            {card.voteCount + (liked ? 1 : 0) > 0 && (
              <span className="tabular-nums">{card.voteCount + (liked ? 1 : 0)}</span>
            )}
          </button>
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className={`${ghostAction} pointer-events-auto text-white/85 hover:text-white`}
            aria-label="댓글"
          >
            <MessageCircle className="h-[15px] w-[15px]" />
            {card.commentCount > 0 && <span className="tabular-nums">{card.commentCount}</span>}
          </Link>
          <span
            className="ml-auto text-[12px] font-medium"
            style={{ color: "rgba(255,255,255,.6)" }}
            suppressHydrationWarning
          >
            {formatRelativeTime(new Date(card.createdAt))}
          </span>
        </div>

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

/* ---------- 2) 미디엄 — 흰 프레임 + 상단 이미지 (Apple News 기본 카드) ---------- */

function FramedCard({ card, eager }: { card: CardNewsItem; eager: boolean }) {
  const { liked, toggle } = useLocalLike(card.id)
  const faceFocus = useFaceFocus(card.image)
  const [playing, setPlaying] = useState(false)
  const ytId = card.media?.provider === "youtube" ? card.media.videoId : undefined

  return (
    <article
      className="group relative overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <Link
        href={`/post/${card.id}?utm_source=cardnews`}
        className="absolute inset-0 z-[2]"
        aria-label={card.title}
        onClick={() => openPost(card.id)}
      />

      {(card.image || card.media) && (
        <div className="relative aspect-video overflow-hidden">
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
            card.media && <MediaPlaceholder provider={card.media.provider} />
          )}
          {(card.source || card.flair || card.media) && (
            <div className="pointer-events-none absolute top-3 left-3 z-[3] flex flex-wrap items-center gap-1.5">
              {card.source && <SourceChip source={card.source} />}
              {card.flair && <FlairChip name={card.flair.name} color={card.flair.color} />}
              {card.media && <PlatformChip provider={card.media.provider} />}
            </div>
          )}
          {ytId && !playing && <PlayButton onPlay={() => setPlaying(true)} />}
          {ytId && playing && (
            <iframe
              className="absolute inset-0 z-[4] h-full w-full"
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title={card.title}
            />
          )}
        </div>
      )}

      <div className="px-4 py-3">
        {/* 이미지 없는 글은 텍스트 위 키커로 출처 표시 */}
        {!card.image && <CompactKicker card={card} />}
        <h2
          className="line-clamp-2"
          style={{
            fontSize: 16.5,
            fontWeight: 700,
            lineHeight: 1.34,
            letterSpacing: "-0.01em",
            color: "var(--wc-ink)",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {card.title}
        </h2>

        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            className={`${ghostAction} pointer-events-auto z-[3] ${
              liked ? "text-rose-500" : "text-[var(--wc-mute)] hover:text-[var(--wc-burgundy)]"
            }`}
            aria-label="좋아요"
            aria-pressed={liked}
          >
            <Heart
              className={`h-[15px] w-[15px] transition-transform active:scale-125 ${liked ? "fill-current" : ""}`}
            />
            {card.voteCount + (liked ? 1 : 0) > 0 && (
              <span className="tabular-nums">{card.voteCount + (liked ? 1 : 0)}</span>
            )}
          </button>
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className={`${ghostAction} pointer-events-auto z-[3] text-[var(--wc-mute)] hover:text-[var(--wc-burgundy)]`}
            aria-label="댓글"
          >
            <MessageCircle className="h-[15px] w-[15px]" />
            {card.commentCount > 0 && <span className="tabular-nums">{card.commentCount}</span>}
          </Link>
          <span
            className="ml-auto text-[12px] font-medium"
            style={{ color: "var(--wc-mute)" }}
            suppressHydrationWarning
          >
            {formatRelativeTime(new Date(card.createdAt))}
          </span>
        </div>

        {card.bestComment && card.commentCount > 0 && (
          <Link
            href={`/post/${card.id}?utm_source=cardnews#comments`}
            className="pointer-events-auto relative z-[3] mt-2.5 flex items-center gap-1.5 pt-2.5"
            style={{ borderTop: "1px solid var(--wc-line)" }}
          >
            <span
              className="shrink-0 text-[11px] font-extrabold"
              style={{ color: "var(--wc-burgundy)" }}
            >
              BEST
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[12.5px]"
              style={{ color: "var(--wc-mute)" }}
            >
              {card.bestComment}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--wc-mute)" }} />
          </Link>
        )}
      </div>
    </article>
  )
}

/* ---------- 3) 컴팩트 — 텍스트 좌 + 썸네일 우 (밀도 담당) ---------- */

function CompactCard({ card }: { card: CardNewsItem }) {
  const { liked, toggle } = useLocalLike(card.id)
  const faceFocus = useFaceFocus(card.image)

  return (
    <article
      className="relative flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <Link
        href={`/post/${card.id}?utm_source=cardnews`}
        className="absolute inset-0 z-[1]"
        aria-label={card.title}
        onClick={() => openPost(card.id)}
      />

      <div className="min-w-0 flex-1">
        <CompactKicker card={card} />
        <h2
          className="line-clamp-2"
          style={{
            fontSize: 14.5,
            fontWeight: 650,
            lineHeight: 1.38,
            letterSpacing: "-0.01em",
            color: "var(--wc-ink)",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {card.title}
        </h2>
        <div className="mt-1.5 flex items-center gap-3.5">
          <button
            type="button"
            onClick={toggle}
            className={`${ghostAction} pointer-events-auto z-[2] !text-[11.5px] ${
              liked ? "text-rose-500" : "text-[var(--wc-mute)]"
            }`}
            aria-label="좋아요"
            aria-pressed={liked}
          >
            <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
            {card.voteCount + (liked ? 1 : 0) > 0 && (
              <span className="tabular-nums">{card.voteCount + (liked ? 1 : 0)}</span>
            )}
          </button>
          <span
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
            style={{ color: "var(--wc-mute)" }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {card.commentCount > 0 && <span className="tabular-nums">{card.commentCount}</span>}
          </span>
          <span
            className="text-[11.5px] font-medium"
            style={{ color: "var(--wc-mute)" }}
            suppressHydrationWarning
          >
            {formatRelativeTime(new Date(card.createdAt))}
          </span>
        </div>
      </div>

      {(card.image || card.media) && (
        <div className="relative h-[76px] w-[104px] shrink-0 overflow-hidden rounded-lg">
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: faceFocus ?? "50% 30%" }}
            />
          ) : (
            card.media && <MediaPlaceholder provider={card.media.provider} />
          )}
          {/* 유튜브 썸네일엔 미니 재생 표시 (재생은 상세/상위 카드 몫) */}
          {card.media?.provider === "youtube" && card.image && (
            <span
              className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,.55)" }}
              aria-hidden
            >
              <Play className="ml-0.5 h-3.5 w-3.5 fill-white text-white" />
            </span>
          )}
        </div>
      )}
    </article>
  )
}

/* ---------- 피드 ---------- */

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

  // 히어로 = 상위 5개 중 이미지 있는 첫 카드를 승격 (톱 자리 회색 플레이스홀더 방지).
  // 이미지가 하나도 없으면 히어로 생략하고 프레임/컴팩트로만 구성.
  const heroIdx = cards.findIndex((c, i) => i < 5 && !!c.image)
  const ordered = heroIdx > 0 ? [cards[heroIdx], ...cards.filter((_, i) => i !== heroIdx)] : cards
  const hasHero = heroIdx !== -1

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((card, i) =>
        hasHero && i === 0 ? (
          <HeroCard key={card.id} card={card} eager />
        ) : i <= (hasHero ? 2 : 1) ? (
          <FramedCard key={card.id} card={card} eager={i < 2} />
        ) : (
          <CompactCard key={card.id} card={card} />
        )
      )}
      <div ref={sentinelRef} className="flex h-10 items-center justify-center">
        {loading && <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />}
        {!cursor && !loading && (
          <p className="text-muted-foreground py-2 text-[13px]">오늘의 뉴스 끝!</p>
        )}
      </div>
    </div>
  )
}
