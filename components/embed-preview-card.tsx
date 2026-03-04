"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ExternalLink, Play, Image as ImageIcon, X } from "lucide-react"

export interface EmbedPreviewCardProps {
  provider: "youtube" | "instagram" | "x"
  url: string
  title?: string
  thumbnail_url?: string
  author_name?: string
  className?: string
  /** LCP 최적화를 위한 priority 속성 */
  priority?: boolean
  /** true면 마운트 시 자동으로 임베드 HTML을 가져와 바로 렌더 */
  autoExpand?: boolean
}

/**
 * EmbedPreviewCard Component
 *
 * 경량 임베드 미리보기 카드 (피드용)
 * - iframe을 렌더링하지 않음
 * - 메타데이터만 표시 (썸네일, 제목, 작성자)
 * - 클릭 시 원본 URL로 이동
 *
 * Features:
 * - 빠른 로딩 (iframe 없음)
 * - 모바일 최적화
 * - 피드 성능 최적화
 */
export function EmbedPreviewCard({
  provider,
  url,
  title,
  thumbnail_url,
  author_name,
  className,
  priority = false,
  autoExpand = false,
}: EmbedPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(autoExpand)
  // SWR: 확장 시에만 fetch (key가 null이면 fetch 안 함)
  const oembedKey = isExpanded
    ? `/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`
    : null
  const { data: oembedData, isLoading: isLoadingEmbed } = useSWR(
    oembedKey,
    (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)),
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  )

  // 제공자별 아이콘 및 색상
  const providerConfig = {
    youtube: {
      icon: Play,
      color: "bg-primary/10 text-primary border-primary/20",
      label: "YouTube",
    },
    instagram: {
      icon: ImageIcon,
      color: "bg-pink-500/10 text-pink-600 border-pink-500/20",
      label: "Instagram",
    },
    x: {
      icon: ExternalLink,
      color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      label: "X (Twitter)",
    },
  }

  const config = providerConfig[provider]
  const Icon = config.icon

  // iframe HTML에 보안 속성 추가
  const sanitizeEmbedHtml = (html: string, prov: "youtube" | "instagram" | "x"): string => {
    if (!html) return html

    // 브라우저 환경에서만 실행
    if (typeof window === "undefined") return html

    try {
      // 임시 div를 생성하여 HTML 파싱
      const tempDiv = document.createElement("div")
      tempDiv.innerHTML = html
      const iframe = tempDiv.querySelector("iframe")

      if (iframe) {
        // 보안 속성 추가
        const sandboxPermissions = [
          "allow-scripts",
          "allow-same-origin",
          "allow-popups",
          "allow-forms",
        ]

        if (prov === "youtube") {
          sandboxPermissions.push("allow-presentation")
        }

        iframe.setAttribute("sandbox", sandboxPermissions.join(" "))
        iframe.setAttribute(
          "allow",
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        )
        iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade")
        iframe.setAttribute("loading", "lazy")

        return tempDiv.innerHTML
      }
    } catch {
      // 파싱 실패 시 원본 HTML 반환
    }

    return html
  }

  // SWR 데이터에서 sanitized HTML 추출
  const embedHtml = oembedData?.html ? sanitizeEmbedHtml(oembedData.html, provider) : null

  // 확장/축소 토글
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExpanded((prev) => !prev)
    // SWR가 key 변경으로 자동 fetch — 중복 방지 내장
  }

  return (
    <Card
      className={cn(
        "border-border bg-card hover:border-muted-foreground/50 overflow-hidden border transition-colors",
        className
      )}
    >
      <CardContent className="p-0">
        {!isExpanded ? (
          // 미리보기 모드: 썸네일 표시
          <button onClick={handleToggleExpand} className="block w-full text-left">
            {/* 썸네일 이미지 */}
            {thumbnail_url ? (
              <div className="bg-muted group relative aspect-video w-full overflow-hidden">
                <Image
                  src={thumbnail_url}
                  alt={title || `${config.label} 콘텐츠`}
                  fill
                  className="object-cover"
                  priority={priority}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
                />
                {/* 제공자 배지 오버레이 */}
                <div className="absolute top-2 left-2">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur-sm",
                      config.color
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="text-xs font-medium">{config.label}</span>
                  </div>
                </div>
                {/* 재생 버튼 오버레이 (중앙) */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
                  <div className="rounded-full bg-white/90 p-3 transition-transform group-hover:scale-110">
                    <Play className="text-foreground ml-0.5 h-6 w-6" fill="currentColor" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted relative flex aspect-video w-full items-center justify-center">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-4 py-2",
                    config.color
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
              </div>
            )}

            {/* 메타데이터 */}
            <div className="space-y-1.5 p-3">
              {title && (
                <h3 className="text-foreground line-clamp-2 text-sm leading-snug font-semibold">
                  {title}
                </h3>
              )}
              {author_name && <p className="text-muted-foreground text-xs">{author_name}</p>}
              <div className="text-muted-foreground flex items-center gap-1.5 pt-1 text-xs">
                <ExternalLink className="h-3 w-3" />
                <span className="truncate">{url}</span>
              </div>
            </div>
          </button>
        ) : (
          // 확장 모드: iframe 재생
          <div className="relative">
            {/* 닫기 버튼 */}
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsExpanded(false)
              }}
              className="absolute top-2 right-2 z-10 rounded-full bg-black/70 p-1.5 text-white transition-colors hover:bg-black/90"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>

            {isLoadingEmbed ? (
              <div
                className="bg-muted flex w-full items-center justify-center rounded-lg"
                style={{ minHeight: provider === "instagram" ? 480 : 320 }}
              >
                <div className="text-center">
                  <div className="border-primary mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2"></div>
                  <p className="text-muted-foreground text-sm">로딩 중...</p>
                </div>
              </div>
            ) : embedHtml ? (
              // oembed HTML 렌더링
              provider === "instagram" ? (
                <InstagramPreviewEmbed html={embedHtml} />
              ) : provider === "x" ? (
                <XPreviewEmbed html={embedHtml} url={url} author_name={author_name} />
              ) : (
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-lg",
                    provider === "youtube" && "aspect-video"
                  )}
                >
                  <div
                    className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
                    dangerouslySetInnerHTML={{ __html: embedHtml }}
                  />
                </div>
              )
            ) : (
              // Fallback: 썸네일 이미지 확대 보기
              <div className="w-full">
                {thumbnail_url ? (
                  <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-lg">
                    <Image
                      src={thumbnail_url}
                      alt={title || `${config.label} 콘텐츠`}
                      fill
                      className="object-contain"
                      sizes="(max-width: 640px) 100vw, 560px"
                    />
                  </div>
                ) : (
                  <div className="bg-muted relative flex aspect-video w-full items-center justify-center rounded-lg">
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-4 py-2",
                        config.color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                  </div>
                )}
                <div className="mt-4 p-3 text-center">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-2 text-sm hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    원본 보기
                  </a>
                </div>
              </div>
            )}

            {/* 메타데이터 (확장 모드에서도 표시) */}
            {(title || author_name) && (
              <div className="border-border space-y-1.5 border-t p-3">
                {title && (
                  <h3 className="text-foreground line-clamp-2 text-sm leading-snug font-semibold">
                    {title}
                  </h3>
                )}
                {author_name && <p className="text-muted-foreground text-xs">{author_name}</p>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Instagram blockquote + embed.js 렌더링 (preview card 확장 시) */
function InstagramPreviewEmbed({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    type InstgrmWindow = Window &
      typeof globalThis & {
        instgrm?: { Embeds: { process: () => void } }
        __igEmbedLoading?: boolean
      }
    const win = window as InstgrmWindow

    const process = () => win.instgrm?.Embeds.process()

    const timer = setTimeout(() => {
      if (win.instgrm) {
        process()
        return
      }
      if (win.__igEmbedLoading) {
        const interval = setInterval(() => {
          if (win.instgrm) {
            clearInterval(interval)
            process()
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
        process()
      }
      document.body.appendChild(script)
    }, 0)

    return () => clearTimeout(timer)
  }, [html])

  return (
    <div
      ref={containerRef}
      className="mx-auto max-w-[540px] p-4 [&_.instagram-media]:!mx-auto"
      style={{ minHeight: 480 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * X(Twitter) 임베드 카드 (preview card 확장 시)
 *
 * fxtwitter API에서 가져온 커스텀 카드 HTML을 렌더링.
 * HTML이 없거나 기존 blockquote면 링크 카드 표시.
 */
function XPreviewEmbed({
  html,
  url,
  author_name,
}: {
  html?: string
  url?: string
  author_name?: string
}) {
  const linkUrl = url || ""

  // fxtwitter 커스텀 카드 HTML이 있으면 렌더링
  if (html && !html.includes("twitter-tweet")) {
    return (
      <div
        className="mx-auto max-w-[550px] p-4 [&_img]:rounded-xl"
        style={{ minHeight: 200 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  // 폴백: 링크 카드
  return (
    <div className="mx-auto max-w-[550px] space-y-3 p-4">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="fill-foreground h-5 w-5" aria-label="X">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        {author_name && <span className="text-foreground text-sm font-medium">{author_name}</span>}
      </div>
      {linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary flex items-center gap-2 text-sm hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          X에서 보기
        </a>
      )}
    </div>
  )
}
