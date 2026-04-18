"use client"

import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { ExternalLink, Loader2, Play } from "lucide-react"
import { loadInstagramEmbedJs, processInstagramEmbeds } from "@/lib/embed/instagram-loader"

export interface EmbedCardProps {
  provider: "youtube" | "instagram" | "x"
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

  // SWR: YouTube가 아니면서 html prop이 없을 때만 fetch.
  // SWR dedup/cache로 같은 URL 다중 embed-card가 있어도 1회만 호출하고 재렌더 시에도 재fetch 안 함.
  const shouldFetch = !youtubeVideoId && !htmlProp
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
    <Card className={cn("border-border bg-card overflow-hidden border", className)}>
      <CardContent className="p-4">
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
    <Card className={cn("border-border bg-card overflow-hidden border", className)}>
      <CardContent className="p-4">
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
        <div
          className={`bg-card px-3 py-2.5 ${!firstMedia ? "border-l-foreground/20 border-l-[3px]" : ""}`}
        >
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
    <button onClick={() => setPlaying(true)} className="group block h-full w-full">
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
