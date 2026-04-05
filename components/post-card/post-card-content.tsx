"use client"

import { useState, useCallback, useEffect, useRef, memo } from "react"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import useSWR from "swr"
import { Play, ChevronLeft, ChevronRight, ImageOff } from "lucide-react"
import { isProbablyDirectImageUrl } from "@/lib/image-paste-url"
import type { TipTapNode } from "@/components/post-card"

/** 임베드 URL 패턴 (YouTube, Instagram, X/Twitter) */
const EMBED_URL_RE =
  /(?:youtube\.com\/(?:watch|shorts\/|embed\/)|youtu\.be\/|instagram\.com\/(?:p|reel)\/|(?:twitter|x)\.com\/\w+\/status)/i

function isMediaUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith("http")) return false
  return isProbablyDirectImageUrl(trimmed) || EMBED_URL_RE.test(trimmed)
}

/**
 * TipTap JSON에서 텍스트만 추출 (피드 미리보기용)
 * 이미지/임베드 URL은 제외
 */
function extractTextFromTipTapJSON(content: TipTapNode): string {
  if (!content || typeof content !== "object") {
    return ""
  }

  if (content.type === "text" && content.text) {
    if (isMediaUrl(content.text)) return ""
    return content.text
  }

  if (Array.isArray(content.content)) {
    return content.content
      .map((node) => extractTextFromTipTapJSON(node))
      .filter(Boolean)
      .join(" ")
  }

  return ""
}

export interface PostCardContentProps {
  postId: number | string
  title: string
  content: string | TipTapNode
  displayImage: string | null
  imageSources: string[]
  firstEmbed: {
    attrs: {
      provider: "youtube" | "instagram" | "x"
      url: string
      title?: string
      thumbnail_url?: string
      author_name?: string
    }
  } | null
  image?: string
  priority: boolean
}

function canUseOptimizedFeedImage(src: string): boolean {
  try {
    const url = new URL(src)
    const host = url.hostname.toLowerCase()
    return (
      host === "i.ytimg.com" ||
      host === "img.youtube.com" ||
      host === "pbs.twimg.com" ||
      host === "img.clerk.com" ||
      host.endsWith(".supabase.co") ||
      host.endsWith(".cdninstagram.com")
    )
  } catch {
    return false
  }
}

export const PostCardContent = memo(function PostCardContent({
  postId,
  title,
  content,
  displayImage,
  imageSources,
  firstEmbed,
  image,
  priority,
}: PostCardContentProps) {
  const hasSingleImage = !!displayImage && !firstEmbed && imageSources.length <= 1

  return (
    <div>
      {/* 제목 + 본문 + 사이드 썸네일 */}
      <div className={hasSingleImage ? "flex gap-4" : undefined}>
        <div className={hasSingleImage ? "min-w-0 flex-1" : undefined}>
          {/* 제목 */}
          <Link href={`/post/${postId}`} className="group block">
            <h2 className="text-foreground group-hover:text-primary line-clamp-2 text-[16px] leading-[1.4] font-semibold transition-colors sm:text-[17px]">
              {title}
            </h2>
          </Link>

          {/* 본문 */}
          {typeof content === "string" ? (
            <p className="text-foreground/80 mt-2 line-clamp-2 text-[14px] leading-[1.6]">
              {content}
            </p>
          ) : (
            <p className="text-foreground/80 mt-2 line-clamp-2 text-[14px] leading-[1.6]">
              {extractTextFromTipTapJSON(content)}
            </p>
          )}
        </div>

        {/* 데스크톱 사이드 썸네일 */}
        {hasSingleImage && displayImage && (
          <Link href={`/post/${postId}`} className="mt-0.5 hidden shrink-0 sm:block">
            <div className="bg-muted h-[84px] w-[120px] overflow-hidden rounded-lg transition-opacity hover:opacity-90">
              <FeedSideThumbnail src={displayImage} alt={title || "Post image"} />
            </div>
          </Link>
        )}
      </div>

      {/* 미디어 (임베드 · 캐러셀 · 모바일 단일이미지) */}
      {firstEmbed && !image ? (
        <div className="mt-2.5">
          {firstEmbed.attrs.provider === "youtube" ? (
            <YouTubeInlinePlayer
              url={firstEmbed.attrs.url}
              thumbnail_url={firstEmbed.attrs.thumbnail_url}
              title={firstEmbed.attrs.title}
              priority={priority}
            />
          ) : firstEmbed.attrs.provider === "x" ? (
            <LazyXInlinePreview url={firstEmbed.attrs.url} />
          ) : firstEmbed.attrs.provider === "instagram" ? (
            <LazyInstagramPreview url={firstEmbed.attrs.url} />
          ) : null}
        </div>
      ) : displayImage ? (
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
          <Link href={`/post/${postId}`} className="mt-2.5 block sm:hidden">
            <FeedImageFrame src={displayImage} alt={title || "Post image"} priority={priority} />
          </Link>
        )
      ) : null}
    </div>
  )
})

/* ── IntersectionObserver 훅 ── */

/** lazy 로드용: 한번 보이면 disconnect */
function useInView(rootMargin = "200px") {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, inView }
}

/** 동영상 자동 정지용: 뷰포트 이탈 시 콜백 호출 */
function useVisibility(onHidden: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          onHidden()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onHidden])

  return ref
}

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
      <div className="bg-muted relative w-full overflow-hidden rounded-lg">
        <div className="text-muted-foreground/50 flex min-h-[120px] w-full items-center justify-center">
          <ImageOff className="h-8 w-8" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-muted relative w-full overflow-hidden rounded-lg">
      <div className="flex max-h-[400px] min-h-[200px] w-full items-center justify-center transition-opacity hover:opacity-95">
        {canUseOptimizedFeedImage(src) ? (
          <Image
            src={src}
            alt={alt}
            width={560}
            height={400}
            className="h-auto max-h-[400px] w-full object-contain"
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
            onError={() => setError(true)}
          />
        ) : (
          <img
            src={src}
            alt={alt}
            className="h-auto max-h-[400px] w-full object-contain"
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
        <Link href={`/post/${postId}`} className="block">
          <FeedImageFrame
            src={currentSrc}
            alt={title || `Post image ${safeIndex + 1}`}
            priority={priority && safeIndex === 0}
          />
        </Link>

        <button
          onClick={prev}
          className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-black/75"
          aria-label="이전 이미지"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={next}
          className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-black/75"
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

/* ── YouTube 인라인 플레이어 ── */

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  )
  return m ? m[1] : null
}

function YouTubeInlinePlayer({
  url,
  thumbnail_url,
  title,
  priority,
}: {
  url: string
  thumbnail_url?: string
  title?: string
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

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div ref={visRef} className="relative aspect-video w-full bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title || "YouTube video"}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button onClick={handlePlay} className="group block h-full w-full">
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/90 shadow-lg transition-transform group-hover:scale-110">
                <Play className="ml-0.5 h-5 w-5 text-white" fill="white" />
              </div>
            </div>
            {/* YouTube 뱃지 */}
            <div className="absolute bottom-2 left-2 z-10">
              <div className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <YoutubeIcon className="h-3.5 w-3.5" />
                <span>YouTube</span>
              </div>
            </div>
          </button>
        )}
      </div>
      {/* 타이틀 영역 — X 임베드와 동일한 하단 구조 */}
      {title && (
        <div className="bg-card px-3 py-2.5">
          <p className="text-foreground line-clamp-2 text-sm leading-snug font-medium">{title}</p>
        </div>
      )}
    </div>
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

function LazyXInlinePreview({ url }: { url: string }) {
  const { ref, inView } = useInView()

  return (
    <div ref={ref}>{inView ? <XInlineContent url={url} /> : <EmbedSkeleton provider="x" />}</div>
  )
}

function XInlineContent({ url }: { url: string }) {
  const { data, isLoading } = useSWR<XOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    oembedFetcher,
    { dedupingInterval: 600_000, revalidateOnFocus: false }
  )

  if (isLoading) {
    return <EmbedSkeleton provider="x" />
  }

  if (!data) {
    return (
      <div className="border-border bg-card overflow-hidden rounded-lg border px-3 py-3">
        <div className="flex items-center gap-2">
          <XIcon className="text-muted-foreground h-5 w-5" />
          <span className="text-muted-foreground text-sm">트윗을 불러올 수 없습니다</span>
        </div>
      </div>
    )
  }

  const firstMedia = data.media?.[0]

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      {/* 미디어 (상단, 통일 프레임) */}
      {firstMedia && (
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {firstMedia.type === "photo" ? (
            <img
              src={firstMedia.url}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          ) : (
            <XVideoPlayer
              media={firstMedia as { type: "video"; url: string; thumbnail_url?: string }}
            />
          )}
          {/* X 뱃지 */}
          <div className="absolute bottom-2 left-2 z-10">
            <div className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <XIcon className="h-3.5 w-3.5" />
              <span>X</span>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 영역 */}
      <div
        className={`bg-card px-3 py-2.5 ${!firstMedia ? "border-l-foreground/20 border-l-[3px]" : ""}`}
      >
        <div className="flex items-center gap-2">
          {data.author_avatar ? (
            <img
              src={data.author_avatar}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          ) : (
            <div className="bg-muted-foreground/30 h-5 w-5 rounded-full" />
          )}
          <span className="text-foreground text-sm font-medium">{data.author_name || "X"}</span>
          <XIcon className="fill-foreground ml-auto h-4 w-4 opacity-30" />
        </div>
        {data.title && (
          <p className="text-foreground/80 mt-1.5 line-clamp-4 text-sm leading-relaxed">
            {data.title}
          </p>
        )}
      </div>
    </div>
  )
}

function XVideoPlayer({
  media,
}: {
  media: { type: "video"; url: string; thumbnail_url?: string }
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
        <button onClick={() => setPlaying(true)} className="group block h-full w-full">
          {media.thumbnail_url && (
            <img
              src={media.thumbnail_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
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

type InstgrmWindow = Window &
  typeof globalThis & {
    instgrm?: { Embeds: { process: () => void } }
    __igEmbedLoading?: boolean
  }

function loadInstagramEmbedJs(callback: () => void) {
  const win = window as InstgrmWindow
  if (win.instgrm) {
    callback()
    return
  }
  if (win.__igEmbedLoading) {
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (win.instgrm) {
        clearInterval(interval)
        callback()
      } else if (attempts > 100) {
        // 10초 후 포기 — 무한 polling 방지
        clearInterval(interval)
        win.__igEmbedLoading = false
      }
    }, 100)
    return
  }
  win.__igEmbedLoading = true
  const script = document.createElement("script")
  script.src = "https://www.instagram.com/embed.js"
  script.async = true
  script.onload = () => {
    win.__igEmbedLoading = false
    callback()
  }
  script.onerror = () => {
    win.__igEmbedLoading = false
  }
  document.body.appendChild(script)
}

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

function InstagramInlineContent({ url }: { url: string }) {
  const normalizedUrl = url.startsWith("https") ? url : `https://${url.replace(/^http:\/\//, "")}`

  // blockquote HTML: oEmbed에서 가져오거나, 실패 시 URL로 직접 생성
  const { data, isLoading } = useSWR<InstagramOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`,
    oembedFetcher,
    { dedupingInterval: 600_000, revalidateOnFocus: false }
  )
  const safeUrl = normalizedUrl.replace(/["<>]/g, "")
  const embedHtml =
    data?.html ||
    `<blockquote class="instagram-media" data-instgrm-permalink="${safeUrl}" data-instgrm-version="14" style="max-width:540px;min-width:326px;width:100%;"></blockquote>`

  useEffect(() => {
    if (isLoading) return
    const timer = setTimeout(() => {
      loadInstagramEmbedJs(() => {
        const win = window as InstgrmWindow
        win.instgrm?.Embeds.process()
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [isLoading, embedHtml])

  if (isLoading) return <EmbedSkeleton provider="instagram" />

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="[&_.instagram-media]:!mx-0 [&_.instagram-media]:!w-full [&_.instagram-media]:!max-w-full [&_.instagram-media]:!min-w-0"
        dangerouslySetInnerHTML={{ __html: embedHtml }}
      />
      {/* Instagram 뱃지 */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10">
        <div className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <InstagramIcon className="h-3.5 w-3.5" />
          <span>Instagram</span>
        </div>
      </div>
    </div>
  )
}

/* ── 통일 스켈레톤 (로드 전 플레이스홀더) ── */

function EmbedSkeleton({ provider }: { provider: "x" | "instagram" }) {
  return (
    <div className="bg-muted flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg">
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

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
    </svg>
  )
}
