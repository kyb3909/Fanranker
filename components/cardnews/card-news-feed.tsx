"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "@/components/ui/app-link"
import {
  Heart,
  MessageCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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
 * 카드뉴스 홈 피드 — 전면 오버레이 카드 (사진 위 제목).
 *
 * 이전에는 히어로(오버레이) 1장 → 미디엄(흰 프레임) 2장 → 컴팩트 리스트의 3단
 * 위계였으나, 오늘의 떡밥 전체를 오버레이 카드로 통일했다(2026-07-28).
 * 시각 자료가 없는 글만 컴팩트 행으로 떨어진다 — 회색 판때기를 300px 높이로
 * 세우는 건 카드뉴스가 아니라 빈 자리다.
 * (흰 프레임 카드 FramedCard 는 같은 커밋에서 제거 — 필요하면 git history 참조)
 *
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

/**
 * 댓글 미리보기 (흰 표면 카드용) — 접힘: BEST 한 줄, 탭하면 상위 3개 인라인 펼침.
 * 공방을 카드 안에서 맛보고 "모두 보기"로 상세 진입하는 참여 사다리.
 */
function CommentPreview({ card }: { card: CardNewsItem }) {
  const [open, setOpen] = useState(false)
  if (card.topComments.length === 0 || card.commentCount === 0) return null
  const first = card.topComments[0]

  return (
    <div
      className="pointer-events-auto relative z-[3] mt-2.5 pt-2.5"
      style={{ borderTop: "1px solid var(--wc-line)" }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1.5 text-left"
          aria-expanded={false}
          aria-label="댓글 미리보기 펼치기"
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
            {first.content}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--wc-mute)" }} />
        </button>
      ) : (
        <div className="space-y-2">
          {card.topComments.map((c, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 text-[11.5px] font-bold" style={{ color: "var(--wc-ink)" }}>
                {c.nickname}
              </span>
              <span
                className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug"
                style={{ color: "var(--wc-mute)" }}
              >
                {c.content}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Link
              href={`/post/${card.id}?utm_source=cardnews#comments`}
              className="text-[12px] font-bold"
              style={{ color: "var(--wc-burgundy)" }}
              onClick={() => openPost(card.id)}
            >
              댓글 {card.commentCount}개 모두 보기 →
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="댓글 미리보기 접기"
              className="p-1"
            >
              <ChevronUp className="h-3.5 w-3.5" style={{ color: "var(--wc-mute)" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- 1) 히어로 — 오버레이 카드 (톱뉴스 1장 전용) ---------- */

function HeroCard({
  card,
  eager,
  detectFace = false,
}: {
  card: CardNewsItem
  eager: boolean
  /** 얼굴 인식은 카드마다 원본 이미지를 한 번 더 내려받는다 → 상단 카드에서만 켠다 */
  detectFace?: boolean
}) {
  const { liked, toggle } = useLocalLike(card.id)
  const faceFocus = useFaceFocus(detectFace ? card.image : null)
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

        {card.topComments.length > 0 && card.commentCount > 0 && (
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
              {card.topComments[0].content}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
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
        <CommentPreview card={card} />
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
  /** 이미 실은 카드 id — 빈 페이지 건너뛰기 루프에서 동기적으로 중복을 걸러야 한다 */
  const seenIds = useRef(new Set(initialCards.map((c) => c.id)))

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    try {
      // 서버가 사진 없는 글을 걸러내므로 한 페이지가 통째로 비어 돌아올 수 있다.
      // 그대로 두면 sentinel 이 화면 밖에 남아 스크롤이 멈추므로, 새 카드가 하나도
      // 없으면 커서를 따라 최대 3페이지까지 이어서 받는다.
      let next: string | null = cursor
      let added = 0
      for (let hop = 0; hop < 3 && next && added === 0; hop++) {
        const res = await fetch(`/api/feed/cardnews?before=${encodeURIComponent(next)}`)
        const d = (await res.json()) as { cards: CardNewsItem[]; nextCursor: string | null }
        // 중복 판정은 ref 로 — setCards 업데이터 안에서 센 값은 이 루프에서 못 읽는다
        const fresh = d.cards.filter((c) => !seenIds.current.has(c.id))
        fresh.forEach((c) => seenIds.current.add(c.id))
        added = fresh.length
        if (fresh.length) setCards((prev) => [...prev, ...fresh])
        next = d.nextCursor
      }
      setCursor(next)
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

  // 톱 자리에 회색 플레이스홀더가 오지 않도록, 상위 5개 중 이미지 있는 첫 카드를 맨 앞으로.
  const heroIdx = cards.findIndex((c, i) => i < 5 && !!c.image)
  const ordered = heroIdx > 0 ? [cards[heroIdx], ...cards.filter((_, i) => i !== heroIdx)] : cards

  return (
    <div className="flex flex-col gap-3">
      {/*
        오늘의 떡밥은 전부 히어로(사진 위 제목) 카드로 간다.
        사진 없는 글은 서버(fetchCardNews)에서 이미 배제되므로 실제로는 전부 이 분기를
        타지만, API 응답이 바뀌어도 회색 판때기가 300px 로 서지 않도록 컴팩트 폴백은 남긴다.
      */}
      {ordered.map((card, i) =>
        card.image || card.media ? (
          <HeroCard key={card.id} card={card} eager={i < 2} detectFace={i < 3} />
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
