"use client"

import { useState, useCallback, useEffect, useRef, memo, type ReactNode } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import useSWR from "swr"
import {
  Play,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ExternalLink,
  MoreHorizontal,
  X as CloseIcon,
} from "lucide-react"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import { RelativeTime } from "@/components/ui/relative-time"
import { canUseOptimizedFeedImage } from "@/lib/image/feed-selector"
import { extractYouTubeId } from "@/lib/embed/youtube"
import { loadInstagramEmbedJs, processInstagramEmbeds } from "@/lib/embed/instagram-loader"
import { useInView } from "@/hooks/use-in-view"
import { useVisibility } from "@/hooks/use-visibility"
import { BoardIcon } from "@/components/sidebar/board-icon"
import type { TipTapNode } from "@/components/post-card"
import type { PostFlair } from "@/types/post"

const CATEGORY_CHIP: Record<string, { bg: string; color: string; emoji?: string }> = {
  축구: { bg: "#FDECEC", color: "#9F1239", emoji: "⚽" },
  야구: { bg: "#EAF1FD", color: "#1E3A8A", emoji: "⚾" },
  농구: { bg: "#FDF1E5", color: "#9A3412", emoji: "🏀" },
  배구: { bg: "#F4EEFB", color: "#581C87", emoji: "🏐" },
  게임: { bg: "#EEF0FA", color: "#2D3A8C", emoji: "🎮" },
  애니: { bg: "#EAF4F4", color: "#0F5858", emoji: "🎌" },
  음악: { bg: "#FDEFF3", color: "#9F1239", emoji: "🎵" },
}
const CHIP_FALLBACK = { bg: "#EFF2F4", color: "#3A3D45" }

/** 미리보기 텍스트에서 http(s) URL 토큰 제거 (원본 데이터 불변) */
function stripUrlTokens(text: string): string {
  return text
    .split(/\s+/)
    .filter((t) => !/^https?:\/\//.test(t))
    .join(" ")
    .trim()
}

interface PostCardContentProps {
  postId: number | string
  title: string
  content: string | TipTapNode
  displayImage: string | null
  imageSources: string[]
  /** 퍼온 글(본문 이미지 없이 대표 이미지만) — true 면 작은 링크 프리뷰 썸네일로 렌더 */
  isLinkPreview: boolean
  firstEmbed: {
    attrs: {
      provider: "youtube" | "instagram" | "x"
      url: string
      title?: string
      thumbnail_url?: string
      author_name?: string
    }
  } | null
  firstVideoSrc?: string | null
  image?: string
  priority: boolean
  category?: string
  categoryLink?: string
  flair?: PostFlair | null
  temperature?: number
  timestamp?: string
}

export const PostCardContent = memo(function PostCardContent({
  postId,
  title,
  content,
  displayImage,
  imageSources,
  isLinkPreview,
  firstEmbed,
  firstVideoSrc,
  image,
  priority,
  category,
  categoryLink,
  flair,
  temperature,
  timestamp,
}: PostCardContentProps) {
  // 퍼온 글(본문 이미지 없이 대표 이미지만) → 제목/요약 옆 작은 썸네일. 부모(isLinkPreview)가 판정.
  const showSideThumb = isLinkPreview && !!displayImage
  const catChip = CATEGORY_CHIP[category ?? ""] ?? CHIP_FALLBACK

  return (
    <div>
      {/* 카테고리 chip + 시간 + 온도 chip */}
      {(category || (temperature != null && temperature > 0)) && (
        <div className="flex items-center gap-2" style={{ marginBottom: 9 }}>
          {category && (
            <>
              {categoryLink ? (
                <Link
                  href={`/community/${categoryLink}`}
                  className="transition-opacity hover:opacity-80"
                >
                  <span
                    className="inline-flex h-6 items-center gap-1 px-[9px] text-[11.5px] font-bold"
                    style={{ background: catChip.bg, color: catChip.color, borderRadius: 6 }}
                  >
                    <BoardIcon slug={category} className="h-3.5 w-3.5" />
                    {category}
                  </span>
                </Link>
              ) : (
                <span
                  className="inline-flex h-6 items-center gap-1 px-[9px] text-[11.5px] font-bold"
                  style={{ background: catChip.bg, color: catChip.color, borderRadius: 6 }}
                >
                  <BoardIcon slug={category} className="h-3.5 w-3.5" />
                  {category}
                </span>
              )}
            </>
          )}
          {timestamp && (
            <span className="shrink-0 text-[12px]" style={{ color: "var(--wc-mute-2, #8B93A0)" }}>
              <RelativeTime date={timestamp} />
            </span>
          )}
          {flair?.name && (
            <span
              className="inline-flex h-6 items-center px-2 text-[11.5px] font-bold"
              style={{
                background: "#eef0f3",
                color: "var(--wc-mute)",
                borderRadius: 6,
              }}
            >
              {flair.name}
            </span>
          )}
          {temperature != null && temperature > 0 && (
            <span
              className="tnum ml-auto inline-flex h-6 items-center gap-1 px-[9px] text-[11.5px] font-bold"
              style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)", borderRadius: 6 }}
            >
              🌡 {temperature}°
            </span>
          )}
        </div>
      )}

      {/* 제목 + 본문 + 사이드 썸네일 */}
      <div className={showSideThumb ? "flex gap-4" : undefined}>
        <div className={showSideThumb ? "min-w-0 flex-1" : undefined}>
          {/* 제목 + 본문 — 블록 전체 클릭 시 게시물로 이동 */}
          <Link href={`/post/${postId}`} className="group gn-pin-title block">
            <h2
              title={title}
              className="font-title line-clamp-1 text-[17.5px] transition-colors group-hover:text-[color:var(--wc-burgundy)] sm:text-[18px]"
              style={{
                color: "var(--wc-ink, #14161a)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.4,
                marginBottom: 6,
              }}
            >
              {title}
            </h2>
            {typeof content === "string" ? (
              <p
                className="line-clamp-1 text-[14px]"
                style={{ color: "var(--wc-mute, #5C6470)", lineHeight: 1.62 }}
              >
                {content}
              </p>
            ) : (
              <p
                className="line-clamp-1 text-[14px]"
                style={{ color: "var(--wc-mute, #5C6470)", lineHeight: 1.62 }}
              >
                {stripUrlTokens(extractTextFromTipTapJSON(content))}
              </p>
            )}
          </Link>
        </div>

        {/* 사이드 썸네일 (퍼온 글) — 모바일·데스크톱 모두 작게 */}
        {showSideThumb && displayImage && (
          <Link
            href={`/post/${postId}`}
            aria-label={title || "게시물 보기"}
            className="mt-0.5 block shrink-0"
          >
            <div className="bg-muted h-[64px] w-[92px] overflow-hidden rounded-lg transition-opacity hover:opacity-90 sm:h-[84px] sm:w-[120px]">
              <FeedSideThumbnail src={displayImage} alt={title || "Post image"} />
            </div>
          </Link>
        )}
      </div>

      {/* 미디어 — 카드 좌우 꽉 차게 (가로 패딩 -mx-5 로 밖으로) */}
      <div className="-mx-5">
        {firstVideoSrc ? (
          <div className="mt-2.5">
            <FeedVideoPlayer src={firstVideoSrc} />
          </div>
        ) : firstEmbed && !image ? (
          <div className="mt-2.5">
            {firstEmbed.attrs.provider === "youtube" ? (
              <YouTubeInlinePlayer
                url={firstEmbed.attrs.url}
                thumbnail_url={firstEmbed.attrs.thumbnail_url}
                title={firstEmbed.attrs.title}
                author_name={firstEmbed.attrs.author_name}
                priority={priority}
              />
            ) : firstEmbed.attrs.provider === "x" ? (
              <LazyXInlinePreview url={firstEmbed.attrs.url} priority={priority} />
            ) : firstEmbed.attrs.provider === "instagram" ? (
              <LazyInstagramPreview url={firstEmbed.attrs.url} />
            ) : null}
          </div>
        ) : !isLinkPreview && displayImage ? (
          imageSources.length > 1 ? (
            <div className="mt-2.5">
              <FeedImageCarousel
                postId={postId}
                title={title}
                imageSources={imageSources}
                priority={priority}
              />
            </div>
          ) : (
            // 업로드 글(본문 이미지) — 1장이어도 큰 이미지로. (퍼온 글은 위 사이드 썸네일이 처리)
            <Link
              href={`/post/${postId}`}
              aria-label={title || "게시물 보기"}
              className="mt-2.5 block"
            >
              <FeedImageFrame src={displayImage} alt={title || "Post image"} priority={priority} />
            </Link>
          )
        ) : null}
      </div>
    </div>
  )
})

/* ── IntersectionObserver 훅 ── */

/* ── 사이드 썸네일 (데스크톱) ── */

function FeedSideThumbnail({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="bg-muted flex h-full w-full items-center justify-center">
        <ImageOff className="text-muted-foreground/40 h-5 w-5" />
      </div>
    )
  }

  return canUseOptimizedFeedImage(src) ? (
    <Image
      src={src}
      alt={alt}
      width={120}
      height={84}
      className="h-full w-full object-cover"
      sizes="120px"
      onError={() => setError(true)}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URL, not in remotePatterns
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  )
}

/* ── 통일 미디어 프레임 (이미지) ── */

function FeedImageFrame({ src, alt, priority }: { src: string; alt: string; priority: boolean }) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="bg-card overflow-hidden" style={{ borderRadius: 10 }}>
        <div className="bg-muted text-muted-foreground/50 flex min-h-[120px] w-full items-center justify-center">
          <ImageOff className="h-8 w-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="border-border bg-card overflow-hidden border-t">
      {/*
        사용자 업로드 이미지는 aspect 비율 예측 불가 → 고정 16/9 컨테이너 + fill + object-cover.
        width/height prop 기반으로는 Next.js가 자연 비율 불일치 경고(지속 발생)를 피할 수 없음.
      */}
      <div className="bg-muted relative flex aspect-video max-h-[480px] w-full items-center justify-center transition-opacity hover:opacity-95">
        {canUseOptimizedFeedImage(src) ? (
          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover"
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
            onError={() => setError(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary user URL, not in remotePatterns
          <img
            src={src}
            alt={alt}
            className="h-auto max-h-[480px] w-full object-cover"
            loading={priority ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            onError={() => setError(true)}
          />
        )}
      </div>
    </div>
  )
}

/* ── 이미지 캐러셀 ── */

function FeedImageCarousel({
  postId,
  title,
  imageSources,
  priority,
}: {
  postId: number | string
  title: string
  imageSources: string[]
  priority: boolean
}) {
  const [current, setCurrent] = useState(0)
  const total = imageSources.length
  // imageSources 변경 시 인덱스 보정
  const safeIndex = current >= total ? 0 : current
  const currentSrc = imageSources[safeIndex]

  const prev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setCurrent((value) => (value - 1 + total) % total)
    },
    [total]
  )

  const next = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setCurrent((value) => (value + 1) % total)
    },
    [total]
  )

  return (
    <div className="mt-2">
      <div className="relative">
        <Link href={`/post/${postId}`} aria-label={title || "게시물 보기"} className="block">
          <FeedImageFrame
            src={currentSrc}
            alt={title || `Post image ${safeIndex + 1}`}
            priority={priority && safeIndex === 0}
          />
        </Link>

        <button
          onClick={prev}
          className="absolute top-1/2 left-2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
          aria-label="이전 이미지"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={next}
          className="absolute top-1/2 right-2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
          aria-label="다음 이미지"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
          {safeIndex + 1} / {total}
        </div>
      </div>
    </div>
  )
}

/* ── 동영상 인라인 플레이어 (피드) ── */
function FeedVideoPlayer({ src }: { src: string }) {
  return (
    <div className="relative aspect-video max-h-[480px] w-full overflow-hidden bg-black">
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}

/* ── YouTube 인라인 플레이어 ── */

function YouTubeInlinePlayer({
  url,
  thumbnail_url,
  title,
  author_name,
  priority,
}: {
  url: string
  thumbnail_url?: string
  title?: string
  author_name?: string
  priority: boolean
}) {
  const [playing, setPlaying] = useState(false)
  const videoId = extractYouTubeId(url)

  const thumb =
    thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null)

  const handleStop = useCallback(() => setPlaying(false), [])
  const visRef = useVisibility(handleStop)

  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPlaying(true)
  }, [])

  if (!videoId) return null

  const sourcePath = author_name ? `youtube.com · ${author_name}` : "youtube.com"

  return (
    <ProviderCard
      accent="#FF0000"
      provider="youtube"
      sourceLabel="YouTube에서 퍼온 동영상"
      sourcePath={sourcePath}
      url={url}
    >
      <div
        ref={visRef}
        className="relative -mx-4 aspect-video w-[calc(100%_+_2rem)] overflow-hidden bg-black"
      >
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title || "YouTube video"}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            onClick={handlePlay}
            aria-label="동영상 재생"
            className="group relative block h-full w-full"
          >
            {thumb && (
              <Image
                src={thumb}
                alt={title || "YouTube"}
                fill
                className="object-cover"
                priority={priority}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/15 transition-colors group-hover:bg-black/30">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF0000] shadow-lg transition-transform group-hover:scale-110">
                <Play className="ml-0.5 h-6 w-6 text-white" fill="white" />
              </div>
            </div>
          </button>
        )}
      </div>
      {title && (
        <p className="text-foreground mt-2.5 line-clamp-2 text-[14px] leading-snug font-bold">
          {title}
        </p>
      )}
      {author_name && <p className="text-muted-foreground mt-1 text-[12px]">{author_name}</p>}
    </ProviderCard>
  )
}

/* ── X (Twitter) Lazy 인라인 프리뷰 ── */
/* 뷰포트에 진입해야 oEmbed 호출 → 스크롤 성능 대폭 개선 */

const oembedFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) return null
    return r.json().catch(() => null)
  })

interface XOEmbedData {
  title?: string
  author_name?: string
  author_avatar?: string
  thumbnail_url?: string
  media?: { type: "photo" | "video"; url: string; thumbnail_url?: string }[]
}

function buildTwitterVideoProxyUrl(url: string) {
  return `/api/media-proxy?url=${encodeURIComponent(url)}`
}

function LazyXInlinePreview({ url, priority }: { url: string; priority?: boolean }) {
  const { ref, inView } = useInView()
  // priority(above-the-fold) 카드는 inView 게이트를 건너뛰고 즉시 렌더 → oembed 즉시 fetch + LCP 이미지 eager.
  const show = priority || inView
  return (
    <div ref={ref}>
      {show ? <XInlineContent url={url} priority={priority} /> : <EmbedSkeleton provider="x" />}
    </div>
  )
}

function XInlineContent({ url, priority }: { url: string; priority?: boolean }) {
  const { data, isLoading } = useSWR<XOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    oembedFetcher,
    { dedupingInterval: 600_000, revalidateOnFocus: false }
  )
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  if (isLoading) {
    return <EmbedSkeleton provider="x" />
  }

  const handle = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status/i)?.[1] ?? null
  // x.com/i/status 형태는 URL handle 이 "i"(placeholder) → author_name 의 실제 @핸들 우선
  const authorHandle = data?.author_name?.match(/\(@?(\w+)\)/)?.[1]
  const realHandle = authorHandle || (handle && handle !== "i" ? handle : null)

  if (!data) {
    return (
      <ProviderCard
        accent="#000000"
        provider="x"
        sourceLabel="X (Twitter)에서 퍼온 게시물"
        sourcePath={realHandle ? `@${realHandle}` : null}
        url={url}
      >
        <p className="text-muted-foreground text-sm">트윗을 불러올 수 없습니다.</p>
      </ProviderCard>
    )
  }

  const firstMedia = data.media?.[0]

  return (
    <ProviderCard
      accent="#000000"
      provider="x"
      sourceLabel="X (Twitter)에서 퍼온 게시물"
      sourcePath={realHandle ? `@${realHandle}` : null}
      url={url}
    >
      {/* 트윗 텍스트 — 해시태그/멘션/링크 #1d9bf0 컬러 */}
      {data.title && (
        <p className="text-foreground mt-2.5 text-[14px] leading-[1.5] whitespace-pre-wrap">
          {renderTweetText(data.title)}
        </p>
      )}

      {/* 미디어 */}
      {firstMedia && (
        <div className="bg-muted relative -mx-4 mt-2.5 aspect-video w-[calc(100%_+_2rem)] overflow-hidden">
          {firstMedia.type === "photo" ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setLightboxSrc(firstMedia.url)
              }}
              className="group block h-full w-full cursor-zoom-in"
              aria-label="이미지 크게 보기"
            >
              <Image
                src={firstMedia.url}
                alt=""
                fill
                className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                sizes="(max-width: 640px) 100vw, 560px"
                priority={priority}
                unoptimized
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = "none"
                }}
              />
            </button>
          ) : (
            <XVideoPlayer
              media={firstMedia as { type: "video"; url: string; thumbnail_url?: string }}
              priority={priority}
            />
          )}
        </div>
      )}

      {lightboxSrc && <EmbedImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </ProviderCard>
  )
}

function EmbedImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  // document.body 로 portal — feed-section 의 content-visibility:auto 컨테이닝 블록 회피.
  // 부모에 contain/transform/filter 가 있으면 fixed 가 viewport 가 아닌 그 박스에 묶임.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="닫기"
        className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- Twitter CDN URL, dimensions unknown */}
      <img
        src={src}
        alt="확대된 트윗 이미지"
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
        referrerPolicy="no-referrer"
      />
    </div>,
    document.body
  )
}

/* 공통 ProviderCard — X / Instagram / YouTube 임베드 카드의 outer 프레임. */
function ProviderCard({
  provider,
  sourcePath,
  url,
  children,
}: {
  accent: string
  provider: "x" | "instagram" | "youtube"
  sourceLabel: string
  sourcePath: string | null
  url: string
  children: ReactNode
}) {
  return (
    <div className="border-border bg-card relative overflow-hidden border-t">
      {/* 출처 헤더 */}
      <header
        className="flex items-center gap-2 py-2 pr-3 pl-4 text-[11px] font-bold"
        style={{
          background: "#fff",
          borderBottom: "1px solid var(--wc-line)",
          color: "var(--wc-ink)",
        }}
      >
        <ProviderBadge provider={provider} />
        {sourcePath && (
          <span style={{ color: "var(--wc-ink)", fontWeight: 700 }}>{sourcePath}</span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto inline-flex items-center gap-0.5 transition-opacity hover:opacity-70"
          style={{ color: "var(--wc-mute)" }}
        >
          원본 가기
          <ExternalLink className="h-3 w-3" />
        </a>
      </header>
      {/* 본문 */}
      <div className="px-4 py-3.5">{children}</div>
    </div>
  )
}

function ProviderBadge({ provider }: { provider: "x" | "instagram" | "youtube" }) {
  if (provider === "x") {
    return (
      <span
        aria-hidden
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-black"
      >
        <XIcon className="h-[10px] w-[10px] text-white" />
      </span>
    )
  }
  if (provider === "instagram") {
    return (
      <span
        aria-hidden
        className="inline-block h-4 w-4 shrink-0 rounded-sm"
        style={{ background: "linear-gradient(135deg, #f09433, #dc2743, #bc1888)" }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#FF0000]"
    >
      <Play className="ml-[1px] h-[8px] w-[8px] fill-white text-white" />
    </span>
  )
}

/** 트윗 텍스트의 해시태그/멘션/링크를 #1d9bf0으로 inline 컬러링. */
function renderTweetText(text: string) {
  const parts = text.split(/(\s+)/)
  return parts.map((p, i) => {
    if (/^[#@][\w가-힣]+/.test(p)) {
      return (
        <span key={i} className="text-[#1d9bf0]" style={{ fontWeight: 600 }}>
          {p}
        </span>
      )
    }
    if (/^https?:\/\/\S+/.test(p)) {
      return (
        <span key={i} className="text-[#1d9bf0]">
          {p}
        </span>
      )
    }
    return <span key={i}>{p}</span>
  })
}

function XVideoPlayer({
  media,
  priority,
}: {
  media: { type: "video"; url: string; thumbnail_url?: string }
  priority?: boolean
}) {
  const [playing, setPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handlePause = useCallback(() => {
    videoRef.current?.pause()
  }, [])
  const visRef = useVisibility(handlePause)

  if (videoError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/90 text-sm text-white/60">
        동영상을 재생할 수 없습니다
      </div>
    )
  }

  return (
    <div ref={visRef} className="h-full w-full">
      {playing ? (
        <video
          ref={videoRef}
          src={buildTwitterVideoProxyUrl(media.url)}
          autoPlay
          controls
          playsInline
          className="h-full w-full object-contain"
          onError={() => setVideoError(true)}
        />
      ) : (
        <button
          onClick={() => setPlaying(true)}
          aria-label="동영상 재생"
          className="group relative block h-full w-full"
        >
          {media.thumbnail_url && (
            <Image
              src={media.thumbnail_url}
              alt=""
              fill
              priority={priority}
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 560px"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/80 shadow-lg transition-transform group-hover:scale-110">
              <Play className="ml-0.5 h-5 w-5 text-white" fill="white" />
            </div>
          </div>
        </button>
      )}
    </div>
  )
}

/* ── Instagram 피드 썸네일 + 클릭 시 임베드 ── */
/* 피드에서는 썸네일만 표시, 클릭 시 embed.js 로드하여 풀 임베드 렌더링 */

interface InstagramOEmbedData {
  thumbnail_url?: string
  html?: string
  title?: string
  author_name?: string
}

function LazyInstagramPreview({ url }: { url: string }) {
  const { ref, inView } = useInView()
  return (
    <div ref={ref}>
      {inView ? <InstagramInlineContent url={url} /> : <EmbedSkeleton provider="instagram" />}
    </div>
  )
}

/** 피드 IG 임베드 — 썸네일 없을 때(FB 토큰 미설정) embed.js 로 실제 게시물 렌더 */
function InstagramJsEmbed({ url }: { url: string }) {
  const m = url.match(/(?:p|reel|tv)\/([\w-]+)/)
  const isReel = url.includes("/reel/")
  const permalink = m ? `https://www.instagram.com/${isReel ? "reel" : "p"}/${m[1]}/` : url
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // blockquote 를 React 밖에서 ref 로 직접 주입한다.
    // dangerouslySetInnerHTML 로 두면 피드 리렌더(무한스크롤 revalidateFirstPage 등) 시 React 가
    // innerHTML 을 다시 적용 → embed.js 가 만든 iframe 을 raw blockquote 로 덮어쓰고, useEffect
    // 는 [permalink] 불변이라 재실행 안 돼 재처리도 안 됨 → 임베드가 height 0 으로 사라짐.
    // 직접 주입하면 React 가 div 내부를 reconcile 하지 않아 iframe 이 리렌더에도 유지됨.
    if (!el.querySelector(".instagram-media")) {
      el.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="margin:0 auto;max-width:540px;min-width:280px;width:100%"></blockquote>`
    }
    loadInstagramEmbedJs(() => processInstagramEmbeds())
  }, [permalink])
  return (
    <div
      ref={containerRef}
      className="-mx-4 mt-1 min-h-[600px] sm:min-h-[760px] [&_.instagram-media]:!mx-auto [&_.instagram-media]:!my-0"
    />
  )
}

function InstagramInlineContent({ url }: { url: string }) {
  const { data, isLoading } = useSWR<InstagramOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    oembedFetcher,
    { dedupingInterval: 600_000, revalidateOnFocus: false }
  )

  if (isLoading) return <EmbedSkeleton provider="instagram" />

  // 담벼락에선 우리 헤더(원본 가기) 없이 embed.js 로 IG 게시물만 렌더.
  // (썸네일이 있는 경우 = FB 토큰 설정 시에만 헤더 + 이미지 + 캡션 커스텀 카드)
  if (!data?.thumbnail_url) {
    return <InstagramJsEmbed url={url} />
  }

  // 출처 = oembed author_name 또는 URL 유저명
  const username = url.match(/instagram\.com\/([\w.]+)\/(?:p|reel|tv)\//i)?.[1] ?? null
  const author = data.author_name?.replace(/^@/, "").trim() || username
  const sourcePath = author ? `@${author}` : null

  return (
    <ProviderCard
      accent="#dc2743"
      provider="instagram"
      sourceLabel="Instagram에서 퍼온 게시물"
      sourcePath={sourcePath}
      url={url}
    >
      {/* 작성자 행 — 썸네일 미리보기일 때만 (embed.js 임베드는 자체 헤더 보유) */}
      {data.thumbnail_url && (
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden
            className="h-9 w-9 shrink-0 rounded-full p-[2px]"
            style={{ background: "linear-gradient(135deg, #f09433, #dc2743, #bc1888)" }}
          >
            <div className="bg-card flex h-full w-full items-center justify-center rounded-full">
              <InstagramIcon className="h-4 w-4 text-[#dc2743]" />
            </div>
          </div>
          <span className="text-foreground min-w-0 flex-1 truncate text-[13px] font-bold">
            {author || "instagram_user"}
          </span>
          <MoreHorizontal className="text-muted-foreground h-5 w-5 shrink-0" />
        </div>
      )}

      {/* 미디어 — 클릭 시 원본 IG로 이동 */}
      {data.thumbnail_url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="bg-muted relative -mx-4 mt-2.5 block aspect-square w-[calc(100%_+_2rem)] overflow-hidden"
        >
          <Image
            src={data.thumbnail_url}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 560px"
            unoptimized
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        </a>
      ) : (
        /* 썸네일 없으면(FB 토큰 미설정) embed.js 로 실제 게시물 렌더 */
        <InstagramJsEmbed url={url} />
      )}

      {/* 캡션 — 썸네일 미리보기일 때만 */}
      {data.thumbnail_url && data.title && (
        <p className="text-foreground mt-2.5 line-clamp-3 text-[13px] leading-[1.5]">
          {author && <span className="font-bold">{author} </span>}
          {data.title}
        </p>
      )}
    </ProviderCard>
  )
}

/* ── 통일 스켈레톤 (로드 전 플레이스홀더) ── */

function EmbedSkeleton({ provider }: { provider: "x" | "instagram" }) {
  // 스켈레톤 높이를 실제 로드 후 높이에 맞춰 예약 → oembed/iframe 로드 시 카드가 자라며
  // 아래 콘텐츠(및 푸터)를 밀어내는 CLS 최소화. 실측 기준(데스크톱 604px 컬럼):
  //  - X 임베드(헤더+텍스트+aspect-video 미디어) ≈ 512px 로 균일 → 데스크톱 470 예약.
  //  - Instagram(embed.js iframe)은 세로형 ≈ 881px → 760 예약(가로형 과예약 최소화 절충).
  // 모바일은 컬럼이 좁아 미디어가 작으므로 반응형으로 낮게 잡아 과예약/역시프트 방지.
  return (
    <div
      className={`bg-muted flex w-full items-center justify-center overflow-hidden rounded-lg ${
        provider === "instagram"
          ? "min-h-[600px] sm:min-h-[760px]"
          : "min-h-[340px] sm:min-h-[470px]"
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        {provider === "x" ? (
          <XIcon className="text-muted-foreground/30 h-10 w-10" />
        ) : (
          <InstagramIcon className="text-muted-foreground/30 h-10 w-10" />
        )}
        <div className="bg-muted-foreground/15 h-1.5 w-16 animate-pulse rounded-full" />
      </div>
    </div>
  )
}

/* ── 프로바이더 아이콘 (SVG 인라인) ── */

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}
