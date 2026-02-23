"use client"

import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useEffect, useRef } from "react"

export interface EmbedCardProps {
  provider: 'youtube' | 'instagram' | 'x'
  url: string
  html?: string // 선택적: 상세 페이지에서만 필요
  title?: string
  thumbnail_url?: string
  author_name?: string
  className?: string
}

/**
 * EmbedCard Component (Full Embed)
 * 
 * 상세 페이지용 전체 임베드 카드
 * - iframe 포함 전체 렌더링
 * - dangerouslySetInnerHTML 사용
 * 
 * Features:
 * - Responsive aspect ratio for video embeds
 * - Mobile-optimized sizing
 * - Fallback to preview if HTML is missing
 */
export function EmbedCard({
  provider,
  url,
  html,
  title,
  thumbnail_url,
  author_name,
  className,
}: EmbedCardProps) {
  // If no HTML, fallback to a preview card
  if (!html) {
    return (
      <Card className={cn("border border-border bg-card", className)}>
        <CardContent className="p-4">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block space-y-2 hover:opacity-80 transition-opacity"
          >
            {thumbnail_url && (
              <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted">
                <Image
                  src={thumbnail_url}
                  alt={title || 'Embed preview'}
                  fill
                  sizes="(max-width: 640px) 100vw, 600px"
                  className="object-cover"
                />
              </div>
            )}
            <div>
              {title && (
                <h3 className="font-semibold text-foreground line-clamp-2">
                  {title}
                </h3>
              )}
              {author_name && (
                <p className="text-sm text-muted-foreground mt-1">
                  {author_name}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2 break-all">
                {url}
              </p>
            </div>
          </a>
        </CardContent>
      </Card>
    )
  }

  // Instagram: blockquote + embed.js 렌더링
  if (provider === 'instagram') {
    return <InstagramEmbed html={html} url={url} className={className} />
  }

  // X: blockquote + widgets.js 렌더링
  if (provider === 'x') {
    return <XEmbed html={html} url={url} title={title} author_name={author_name} className={className} />
  }

  // Render embed HTML with responsive wrapper (YouTube)
  return (
    <Card className={cn("border border-border bg-card overflow-hidden", className)}>
      <CardContent className="p-0">
        <div className="relative w-full aspect-video">
          <div
            className="w-full h-full [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:border-0"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {(title || author_name) && (
          <div className="p-4 border-t border-border bg-muted/30">
            {title && (
              <h3 className="font-semibold text-sm text-foreground line-clamp-2">
                {title}
              </h3>
            )}
            {author_name && (
              <p className="text-xs text-muted-foreground mt-1">
                {author_name}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** embed.js 로드 유틸리티 (전역 1회만 로드) */
type InstgrmWindow = Window & typeof globalThis & {
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
  const script = document.createElement('script')
  script.src = 'https://www.instagram.com/embed.js'
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
    <Card className={cn("border border-border bg-card overflow-hidden", className)}>
      <CardContent className="p-4">
        <div
          ref={containerRef}
          className="max-w-[540px] mx-auto [&_.instagram-media]:!mx-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-muted-foreground mt-2 hover:underline break-all"
        >
          {url}
        </a>
      </CardContent>
    </Card>
  )
}

/** widgets.js 로드 유틸리티 (전역 1회만 로드) */
type TwttrWindow = Window & typeof globalThis & {
  twttr?: { widgets: { load: (el?: HTMLElement) => void } }
  __twttrLoading?: boolean
}

function loadTwitterWidgetsJs(callback: () => void) {
  const win = window as TwttrWindow
  if (win.twttr) {
    callback()
    return
  }
  if (win.__twttrLoading) {
    const interval = setInterval(() => {
      if (win.twttr) {
        clearInterval(interval)
        callback()
      }
    }, 100)
    return
  }
  win.__twttrLoading = true
  const script = document.createElement('script')
  script.src = 'https://platform.twitter.com/widgets.js'
  script.async = true
  script.onload = () => {
    win.__twttrLoading = false
    callback()
  }
  document.body.appendChild(script)
}

/**
 * X(Twitter) 임베드 전용 컴포넌트
 * blockquote를 삽입 후 widgets.js를 로드하여 인터랙티브 렌더링
 */
function XEmbed({
  html,
  url,
  title,
  author_name,
  className,
}: {
  html: string
  url: string
  title?: string
  author_name?: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTwitterWidgetsJs(() => {
        const win = window as TwttrWindow
        if (containerRef.current) {
          win.twttr?.widgets.load(containerRef.current)
        }
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [html])

  return (
    <Card className={cn("border border-border bg-card overflow-hidden", className)}>
      <CardContent className="p-4">
        <div
          ref={containerRef}
          className="max-w-[550px] mx-auto [&_.twitter-tweet]:!mx-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {(title || author_name) && (
          <div className="mt-2 border-t border-border pt-2">
            {title && (
              <h3 className="font-semibold text-sm text-foreground line-clamp-2">
                {title}
              </h3>
            )}
            {author_name && (
              <p className="text-xs text-muted-foreground mt-1">
                {author_name}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

