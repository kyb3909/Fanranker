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
 * embed.js 시도 → 5초 내 iframe 미생성 시 브랜드 카드 폴백
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
  const [embedFailed, setEmbedFailed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInstagramEmbedJs(() => {
        const win = window as InstgrmWindow
        win.instgrm?.Embeds.process()
      })
    }, 0)

    // embed.js가 5초 내 iframe을 생성하지 않으면 폴백
    const fallbackTimer = setTimeout(() => {
      if (!containerRef.current?.querySelector("iframe")) {
        setEmbedFailed(true)
      }
    }, 5000)

    return () => {
      clearTimeout(timer)
      clearTimeout(fallbackTimer)
    }
  }, [html])

  if (embedFailed) {
    const isReel = url.includes("/reel/")
    return (
      <Card className={cn("border-border overflow-hidden border", className)}>
        <CardContent className="p-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 transition-opacity hover:opacity-90"
          >
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-white">
                  {isReel ? "Instagram Reel" : "Instagram 게시물"}
                </p>
                <p className="text-[13px] text-white/70">Instagram에서 보기</p>
              </div>
              <ExternalLink className="h-5 w-5 shrink-0 text-white/60" />
            </div>
          </a>
        </CardContent>
      </Card>
    )
  }

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
