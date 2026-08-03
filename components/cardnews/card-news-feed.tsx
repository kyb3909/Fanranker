"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import Link from "@/components/ui/app-link"
import { PollWidget } from "@/components/sidebar/poll-widget"
import { DiscordInviteBanner } from "@/components/discord-invite-banner"
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

/** 고스트 액션 — 아이콘+숫자. 히트 영역은 실제 padding 으로 확보 (-m 이 layout 상쇄 —
 * pseudo(::before) hit area 는 target-size 접근성 감사가 인정하지 않아 실박스로 전환) */
const ghostAction =
  "-m-2.5 p-2.5 relative inline-flex items-center gap-1 text-[12.5px] font-semibold transition-colors"

/**
 * 카드 좋아요 — 비로그인은 로컬 즉각 반응(기존), 로그인은 **실제 vote API** 동기화.
 * 2026-07-30 워룸: 가장 마찰 낮은 참여 장치가 localStorage 전용이라 서버에 아무것도
 * 안 쌓였고, 그게 "추천 0" 전시가 구조적으로 재생산되던 뿌리였다.
 */
function useLocalLike(id: string) {
  const { isSignedIn } = useAuth()
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
    // 로그인 유저는 서버에도 반영 (API 도 토글이라 로컬 토글과 방향이 맞는다).
    // 실패해도 UI 는 로컬 상태 유지 — 좋아요는 비핵심 경로라 조용히 넘어간다.
    if (isSignedIn) {
      fetch(`/api/posts/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "up" }),
      }).catch(() => {})
    }
  }, [id, isSignedIn])
  return { liked, toggle }
}

/** 이적시장 상황판 진입 카드 — 라이트 존 규칙(카드 다크 금지) 준수, 배경 틴트로만 구분 */
function TransferPromoCard() {
  return (
    <Link
      href="/transfer?utm_source=home_cardnews"
      className="block rounded-2xl px-4 py-3.5 no-underline transition-opacity hover:opacity-90"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
      onClick={() => trackEvent({ name: "board_view", params: { board: "transfer_promo" } })}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px]"
          style={{
            background: "color-mix(in srgb, var(--wc-burgundy) 9%, transparent)",
          }}
        >
          🔁
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[14.5px] font-extrabold"
            style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
          >
            이적시장 상황판
          </span>
          <span
            className="mt-0.5 block text-[12.5px]"
            style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
          >
            오피셜 · Here we go · 루머를 신뢰 등급으로 — 실시간 타임라인
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--wc-mute)" }}
          aria-hidden
        />
      </div>
    </Link>
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

/* ---------- VS 쟁점 인카드 투표 (안 1, 2026-07-31) ---------- */

/* ---------- 3) 컴팩트 — 텍스트 좌 + 썸네일 우 (밀도 담당) ---------- */

function CompactCard({ card }: { card: CardNewsItem }) {
  const { liked, toggle } = useLocalLike(card.id)
  const faceFocus = useFaceFocus(card.image)

  return (
    <article
      className="relative flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      {/* 이적설 사가가 붙은 기사는 위키로 직행 (2026-08-03 오너 — "게시물이 아니라 위키로") */}
      <Link
        href={
          card.sagaSlug
            ? `/saga/${card.sagaSlug}?utm_source=cardnews`
            : `/post/${card.id}?utm_source=cardnews`
        }
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
          {/* 글쓴이 — 운영자 요청 (2026-08-03): 제목·글쓴이·좋아요·댓글 구성 */}
          {card.author && (
            <span
              className="max-w-[92px] truncate text-[11.5px] font-semibold"
              style={{ color: "var(--wc-mute)" }}
            >
              {card.author}
            </span>
          )}
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
  excludeIds,
}: {
  initialCards: CardNewsItem[]
  initialCursor: string | null
  /** 피드에서 제외할 글 id — 히어로(Top Story)에 이미 오른 글의 중복 노출 방지 */
  excludeIds?: string[]
}) {
  const [cards, setCards] = useState(initialCards)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  /** 이미 실은 카드 id — 빈 페이지 건너뛰기 루프에서 동기적으로 중복을 걸러야 한다.
   *  excludeIds(히어로 글)를 시드해두면 무한스크롤 뒷페이지에서도 자연히 걸러진다. */
  const seenIds = useRef(new Set([...initialCards.map((c) => c.id), ...(excludeIds ?? [])]))

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

  return (
    <div className="flex flex-col gap-3">
      {/*
        오늘의 떡밥 = 전부 컴팩트 카드 (2026-08-03 운영자 확정 — 이전 기안 채택).
        좌: 제목·글쓴이·좋아요·댓글수 / 우: 썸네일. 전면 오버레이(HeroCard)는 홈 상단
        히어로(운영자 큐레이션) 전용으로만 남는다. 정렬은 서버(fetchCardNews)가
        온도순으로 내려주므로 여기서 재배열하지 않는다.
      */}
      {cards.map((card, i) => (
        <Fragment key={card.id}>
          <CompactCard card={card} />
          {/* 모바일 인피드 슬롯 — 데스크톱은 우측 사이드바가 담당(lg:hidden).
              폴 실험(반응 유도)이 주력 디바이스에서 hidden lg:block 으로 무효였던 것 수정
              (2026-07-30 워룸). 3번째 카드 뒤 폴 1개, 9번째 뒤 디스코드 1개 — 도배 금지. */}
          {i === 2 && (
            <div className="lg:hidden">
              <PollWidget />
            </div>
          )}
          {/* 이적시장 상황판 — 가장 강한 비로그인 축구 자산인데 홈에 진입로가 0개였다
              (2026-07-30 워룸). 오피셜 뱃지 룰 보수화(2026-07-31) 선행 후 노출. */}
          {i === 5 && <TransferPromoCard />}
          {i === 8 && (
            <div className="lg:hidden">
              <DiscordInviteBanner variant="sidebar" placement="mobile_cardnews_feed" />
            </div>
          )}
        </Fragment>
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
