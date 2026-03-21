"use client"

import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { ExternalLink, Loader2, Play } from "lucide-react"

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

  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null)
  const [fetchedData, setFetchedData] = useState<XOEmbedData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // YouTube가 아닌 경우: html prop이 없으면 oEmbed API에서 자동 fetch
  useEffect(() => {
    if (youtubeVideoId || htmlProp || fetchedHtml || fetchedData) return
    setIsLoading(true)
    const apiUrl =
      provider === "x"
        ? `/api/oembed?url=${encodeURIComponent(url)}`
        : `/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`

    fetch(apiUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (provider === "x") setFetchedData(data)
        if (data?.html) setFetchedHtml(data.html)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [url, htmlProp, fetchedHtml, fetchedData, youtubeVideoId, provider])

  // YouTube: 직접 iframe
  if (youtubeVideoId && !htmlProp) {
    return (
      <Card className={cn("border-border bg-card overflow-hidden border", className)}>
        <CardContent className="p-0">
          <div className="relative aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeVideoId}?rel=0`}
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          {(title || author_name) && (
            <div className="border-border bg-muted/30 border-t p-4">
              {title && (
                <h3 className="text-foreground line-clamp-2 text-sm font-semibold">{title}</h3>
              )}
              {author_name && <p className="text-muted-foreground mt-1 text-xs">{author_name}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const html = htmlProp || fetchedHtml

  // 로딩 중
  if (!html && isLoading) {
    return (
      <Card className={cn("border-border bg-card border", className)}>
        <CardContent className="flex aspect-video items-center justify-center p-4">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  // HTML 없으면 fallback
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

  // X: blockquote + widgets.js 렌더링
  if (provider === "x") {
    return (
      <XRichEmbed data={fetchedData} url={url} author_name={author_name} className={className} />
    )
  }

  // Render embed HTML with responsive wrapper (YouTube)
  return (
    <Card className={cn("border-border bg-card overflow-hidden border", className)}>
      <CardContent className="p-0">
        <div className="relative aspect-video w-full">
          <div
            className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {(title || author_name) && (
          <div className="border-border bg-muted/30 border-t p-4">
            {title && (
              <h3 className="text-foreground line-clamp-2 text-sm font-semibold">{title}</h3>
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

/** embed.js 로드 유틸리티 (전역 1회만 로드) */
type InstgrmWindow = Window &
  typeof globalThis & {
    instgrm?: { Embeds: { process: () => void } }
    __igEmbedLoading?: boolean
  }

function loadInstagramEmbedJs(callback: () => void) {
  const win = window as InstgrmWindow
  // 이미 로드 완료된 경우
  if (win.instgrm) {
    callback()
    return
  }
  // 이미 로드 중인 경우 — 로드 완료까지 polling
  if (win.__igEmbedLoading) {
    const interval = setInterval(() => {
      if (win.instgrm) {
        clearInterval(interval)
        callback()
      }
    }, 100)
    return
  }
  // 최초 로드
  win.__igEmbedLoading = true
  const script = document.createElement("script")
  script.src = "https://www.instagram.com/embed.js"
  script.async = true
  script.onload = () => {
    win.__igEmbedLoading = false
    callback()
  }
  document.body.appendChild(script)
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

  useEffect(() => {
    // DOM에 blockquote가 삽입된 후 embed.js 로드 + process()
    const timer = setTimeout(() => {
      loadInstagramEmbedJs(() => {
        const win = window as InstgrmWindow
        win.instgrm?.Embeds.process()
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [html])

  return (
    <Card className={cn("border-border bg-card overflow-hidden border", className)}>
      <CardContent className="p-4">
        <div
          ref={containerRef}
          className="mx-auto max-w-[540px] [&_.instagram-media]:!mx-auto"
          dangerouslySetInnerHTML={{ __html: html }}
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
    <Card className={cn("border-border bg-card overflow-hidden border", className)}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {data.author_avatar ? (
              <img src={data.author_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="bg-muted-foreground/30 h-8 w-8 rounded-full" />
            )}
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-semibold">
                {data.author_name || author_name}
              </p>
            </div>
            <svg viewBox="0 0 24 24" className="fill-foreground ml-auto h-4 w-4 opacity-60">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>

          {data.title && <p className="text-foreground/90 text-sm leading-relaxed">{data.title}</p>}

          {firstMedia && <XRichMedia media={firstMedia} />}

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-2 text-sm hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
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
      <div className="relative aspect-video w-full overflow-hidden rounded-xl">
        <img src={media.url} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {playing ? (
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
            <img
              src={media.thumbnail_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
            <div className="rounded-full bg-white/90 p-3 transition-transform group-hover:scale-110">
              <Play className="text-foreground ml-0.5 h-6 w-6" fill="currentColor" />
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
