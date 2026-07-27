"use client"

import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { ExternalLink, Loader2, Play } from "lucide-react"
import { loadInstagramEmbedJs, processInstagramEmbeds } from "@/lib/embed/instagram-loader"

/** 플랫폼 BI 헤더 스트립 */
function PlatformBadge({ platform }: { platform: "youtube" | "x" | "instagram" | "streamable" }) {
  const configs = {
    youtube: {
      bg: "var(--wc-card, #ffffff)",
      iconColor: "#FF0000",
      label: "YouTube",
      labelColor: "var(--wc-mute, #5C6470)",
      source: "youtube.com",
      sourceMuted: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M23 7.2s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.4-1C16.6 3.6 12 3.6 12 3.6s-4.6 0-7.7.3c-.5.1-1.5.1-2.4 1-.7.7-.9 2.3-.9 2.3S.8 9.1.8 11v1.8c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.6.3 7.6.3s4.6 0 7.7-.3c.5-.1 1.5-.1 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.7 15.1V8.4l6.2 3.4-6.2 3.3z" />
        </svg>
      ),
      borderBottom: "1px solid var(--wc-line, #E2E5EA)",
    },
    x: {
      bg: "#000000",
      iconColor: "#FFFFFF",
      label: "",
      labelColor: "#FFFFFF",
      source: "x.com",
      sourceMuted: false,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      borderBottom: "none",
    },
    instagram: {
      bg: "linear-gradient(95deg, #F9CE34 -15%, #EE2A7B 52%, #6228D7 115%)",
      iconColor: "#FFFFFF",
      label: "Instagram",
      labelColor: "#FFFFFF",
      source: "instagram.com",
      sourceMuted: false,
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          width="15"
          height="15"
        >
          <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5.2" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      ),
      borderBottom: "none",
    },
    streamable: {
      bg: "var(--wc-card, #ffffff)",
      iconColor: "#0F90FA",
      label: "Streamable",
      labelColor: "var(--wc-mute, #5C6470)",
      source: "streamable.com",
      sourceMuted: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14.5v-9l7 4.5-7 4.5z" />
        </svg>
      ),
      borderBottom: "1px solid var(--wc-line, #E2E5EA)",
    },
  } as const

  const c = configs[platform]
  const sourceOpacity = c.sourceMuted ? "var(--wc-mute-2, #8B93A0)" : "rgba(255,255,255,0.62)"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "9px 13px",
        background: c.bg,
        borderBottom: c.borderBottom,
      }}
    >
      <span style={{ display: "inline-flex", color: c.iconColor }}>{c.icon}</span>
      {c.label && (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: "0.06em",
            color: c.labelColor,
            textTransform: "uppercase",
          }}
        >
          {c.label}
        </span>
      )}
      <span
        style={{
          marginLeft: "auto",
          fontSize: 11.5,
          color: sourceOpacity,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          width="11"
          height="11"
        >
          <path
            d="M10 14a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1M14 10a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"
            strokeLinecap="round"
          />
        </svg>
        {c.source}
      </span>
    </div>
  )
}

interface EmbedCardProps {
  provider: "youtube" | "instagram" | "x" | "streamable"
  url: string
  html?: string // 선택적: 상세 페이지에서만 필요
  title?: string
  thumbnail_url?: string
  author_name?: string
  className?: string
}

interface XOEmbedData {
  title?: string
  author_name?: string
  author_avatar?: string
  thumbnail_url?: string
  media?: { type: "photo" | "video"; url: string; thumbnail_url?: string }[]
}

/**
 * EmbedCard Component (Full Embed)
 *
 * 상세 페이지용 전체 임베드 카드
 * - html이 없으면 oEmbed API에서 자동 fetch
 * - iframe 포함 전체 렌더링
 */
export function EmbedCard({
  provider,
  url,
  html: htmlProp,
  title,
  thumbnail_url,
  author_name,
  className,
}: EmbedCardProps) {
  // YouTube: 직접 iframe 렌더링 (oEmbed API 불필요)
  const youtubeVideoId =
    provider === "youtube"
      ? url.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
        )?.[1]
      : null

  // Streamable: shortcode 추출 → iframe 직접 렌더 (oEmbed/html 불필요)
  const streamableId =
    provider === "streamable"
      ? url.match(/streamable\.com\/(?:[eosm]\/)?([a-zA-Z0-9]+)/)?.[1]
      : null

  // SWR: YouTube가 아니면서 html prop이 없을 때만 fetch.
  // 단, X는 저장된 html을 쓰지 않고 fetch한 구조화 데이터(media 포함)로 렌더하므로,
  // html이 저장돼 있어도 항상 fetch한다. (html 저장된 옛 X글이 상세에서 fallback 링크
  // 카드만 뜨던 버그 수정 — 피드는 attrs로 그려 정상이라 상세만 깨졌었음)
  // SWR dedup/cache로 같은 URL 다중 embed-card가 있어도 1회만 호출하고 재렌더 시에도 재fetch 안 함.
  const shouldFetch =
    !youtubeVideoId && provider !== "streamable" && (provider === "x" || !htmlProp)
  const apiUrl = shouldFetch
    ? provider === "x"
      ? `/api/oembed?url=${encodeURIComponent(url)}`
      : `/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`
    : null

  const { data: swrData, isLoading } = useSWR<(XOEmbedData & { html?: string }) | null>(
    apiUrl,
    (u: string) => fetch(u).then((r) => (r.ok ? r.json().catch(() => null) : null)),
    { dedupingInterval: 600_000, revalidateOnFocus: false, revalidateIfStale: false }
  )

  const fetchedHtml = swrData?.html ?? null
  const fetchedData = provider === "x" ? (swrData as XOEmbedData | null) : null

  // YouTube: 직접 iframe
  if (youtubeVideoId && !htmlProp) {
    return (
      <Card className={cn("border-border overflow-hidden border", className)}>
        <CardContent className="p-0">
          <PlatformBadge platform="youtube" />
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeVideoId}?rel=0`}
              title={title || "YouTube video"}
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          {(title || author_name) && (
            <div className="bg-card px-3 py-2.5">
              {title && (
                <h3 className="text-foreground line-clamp-2 text-sm leading-snug font-medium">
                  {title}
                </h3>
              )}
              {author_name && <p className="text-muted-foreground mt-1 text-xs">{author_name}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Streamable: shortcode 로 iframe 직접 렌더 (레딧 클립처럼 인라인 플레이어)
  if (provider === "streamable") {
    if (!streamableId) {
      return (
        <Card className={cn("border-border bg-card border", className)}>
          <CardContent className="p-4">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary text-sm break-all hover:underline"
            >
              {url}
            </a>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card className={cn("border-border overflow-hidden border", className)}>
        <CardContent className="p-0">
          <PlatformBadge platform="streamable" />
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={`https://streamable.com/e/${streamableId}`}
              title="Streamable video"
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  const html = htmlProp || fetchedHtml

  // X: oEmbed API에서 구조화된 data를 받아 자체 카드로 렌더 (html 불필요)
  if (provider === "x") {
    if (isLoading && !fetchedData) {
      return (
        <Card className={cn("border-border bg-card border", className)}>
          <CardContent className="flex aspect-video items-center justify-center p-4">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </CardContent>
        </Card>
      )
    }
    return (
      <XRichEmbed data={fetchedData} url={url} author_name={author_name} className={className} />
    )
  }

  // 로딩 중 (YouTube/Instagram)
  if (!html && isLoading) {
    return (
      <Card className={cn("border-border bg-card border", className)}>
        <CardContent className="flex aspect-video items-center justify-center p-4">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  // HTML 없으면 generic fallback (YouTube oEmbed 실패 등)
  if (!html) {
    return (
      <Card className={cn("border-border bg-card border", className)}>
        <CardContent className="p-4">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block space-y-2 transition-opacity hover:opacity-80"
          >
            {thumbnail_url && (
              <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-md">
                <Image
                  src={thumbnail_url}
                  alt={title || "Embed preview"}
                  fill
                  sizes="(max-width: 640px) 100vw, 600px"
                  className="object-cover"
                />
              </div>
            )}
            <div>
              {title && <h3 className="text-foreground line-clamp-2 font-semibold">{title}</h3>}
              {author_name && <p className="text-muted-foreground mt-1 text-sm">{author_name}</p>}
              <p className="text-muted-foreground mt-2 text-xs break-all">{url}</p>
            </div>
          </a>
        </CardContent>
      </Card>
    )
  }

  // Instagram: blockquote + embed.js 렌더링
  if (provider === "instagram") {
    return <InstagramEmbed html={html} url={url} className={className} />
  }

  // Render embed HTML with responsive wrapper (YouTube)
  return (
    <Card className={cn("border-border overflow-hidden border", className)}>
      <CardContent className="p-0">
        <PlatformBadge platform="youtube" />
        <div className="relative aspect-video w-full bg-black">
          <div
            className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {(title || author_name) && (
          <div className="bg-card px-3 py-2.5">
            {title && (
              <h3 className="text-foreground line-clamp-2 text-sm leading-snug font-medium">
                {title}
              </h3>
            )}
            {author_name && <p className="text-muted-foreground mt-1 text-xs">{author_name}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function buildTwitterVideoProxyUrl(url: string) {
  return `/api/media-proxy?url=${encodeURIComponent(url)}`
}

/**
 * Instagram 임베드 전용 컴포넌트
 * blockquote를 삽입 후 embed.js를 로드하여 인터랙티브 렌더링
 */
function InstagramEmbed({
  html,
  url,
  className,
}: {
  html: string
  url: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 기존 DB 게시물: sanitize가 data-instgrm-permalink를 제거한 상태일 수 있음 → URL로 재생성
  const safeHtml = html.includes("data-instgrm-permalink")
    ? html
    : (() => {
        const m = url.match(/(?:p|reel)\/([a-zA-Z0-9_-]+)/)
        const isReel = url.includes("/reel/")
        const permalink = m ? `https://www.instagram.com/${isReel ? "reel" : "p"}/${m[1]}/` : url
        return `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="max-width:540px;min-width:326px;width:100%;"></blockquote>`
      })()

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInstagramEmbedJs(() => processInstagramEmbeds())
    }, 0)
    return () => clearTimeout(timer)
  }, [safeHtml])

  return (
    <Card className={cn("border-border overflow-hidden border", className)}>
      <CardContent className="p-0">
        <PlatformBadge platform="instagram" />
        <div className="bg-card p-4">
          <div
            ref={containerRef}
            className="mx-auto max-w-[540px] [&_.instagram-media]:!mx-auto"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground mt-2 block text-xs break-all hover:underline"
          >
            {url}
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

/** X(Twitter) 폴백 카드 — widgets.js/syndication API가 불안정하여 바로 링크 카드 표시 */
function XFallbackCard({
  url,
  author_name,
  className,
}: {
  url: string
  author_name?: string
  className?: string
}) {
  return (
    <Card className={cn("border-border overflow-hidden border", className)}>
      <CardContent className="p-0">
        <PlatformBadge platform="x" />
        <div className="bg-card p-4">
          <div className="mx-auto max-w-[550px] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="fill-foreground h-5 w-5" aria-label="X">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                {author_name && (
                  <span className="text-foreground text-sm font-medium">{author_name}</span>
                )}
              </div>
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-2 text-sm hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              X에서 보기
            </a>
            <p className="text-muted-foreground text-xs break-all">{url}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * X(Twitter) 임베드 전용 컴포넌트
 *
 * 상세 페이지도 피드와 같은 구조화된 데이터를 사용해 안정적으로 렌더링한다.
 */
function XRichEmbed({
  data,
  url,
  author_name,
  className,
}: {
  data: XOEmbedData | null
  url: string
  author_name?: string
  className?: string
}) {
  if (!data) {
    return <XFallbackCard url={url} author_name={author_name} className={className} />
  }

  const firstMedia = data.media?.[0]

  return (
    <Card className={cn("border-border overflow-hidden border", className)}>
      <CardContent className="p-0">
        <PlatformBadge platform="x" />
        {/* 미디어 영역 — 피드와 동일 프레임 */}
        {firstMedia && (
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            <XRichMedia media={firstMedia} />
            <div className="absolute bottom-2 left-2 z-10">
              <div className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>X</span>
              </div>
            </div>
          </div>
        )}

        {/* 텍스트 영역 — 피드와 동일 구조 */}
        <div className="bg-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            {data.author_avatar ? (
              <Image
                src={data.author_avatar}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
            ) : (
              <div className="bg-muted-foreground/30 h-5 w-5 rounded-full" />
            )}
            <span className="text-foreground text-sm font-medium">
              {data.author_name || author_name}
            </span>
            <svg viewBox="0 0 24 24" className="fill-foreground ml-auto h-4 w-4 opacity-30">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>

          {data.title && (
            <p className="text-foreground/80 mt-1.5 text-sm leading-relaxed">{data.title}</p>
          )}

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary mt-2 inline-flex items-center gap-1.5 text-xs hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            X에서 보기
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

function XRichMedia({
  media,
}: {
  media: { type: "photo" | "video"; url: string; thumbnail_url?: string }
}) {
  const [playing, setPlaying] = useState(false)

  if (media.type === "photo") {
    return (
      <Image
        src={media.url}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 640px) 100vw, 560px"
        onError={(e) => {
          e.currentTarget.style.display = "none"
        }}
      />
    )
  }

  return playing ? (
    <video
      src={buildTwitterVideoProxyUrl(media.url)}
      autoPlay
      controls
      playsInline
      className="h-full w-full object-contain"
    />
  ) : (
    <button onClick={() => setPlaying(true)} className="group relative block h-full w-full">
      {media.thumbnail_url && (
        <Image
          src={media.thumbnail_url}
          alt=""
          fill
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
  )
}
