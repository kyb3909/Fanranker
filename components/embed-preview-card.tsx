"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ExternalLink, Play, Image as ImageIcon, X } from "lucide-react"

export interface EmbedPreviewCardProps {
  provider: 'youtube' | 'instagram' | 'x'
  url: string
  title?: string
  thumbnail_url?: string
  author_name?: string
  className?: string
  /** LCP 최적화를 위한 priority 속성 */
  priority?: boolean
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
}: EmbedPreviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [embedHtml, setEmbedHtml] = useState<string | null>(null)
  const [isLoadingEmbed, setIsLoadingEmbed] = useState(false)

  // 제공자별 아이콘 및 색상
  const providerConfig = {
    youtube: {
      icon: Play,
      color: 'bg-red-500/10 text-red-600 border-red-500/20',
      label: 'YouTube',
    },
    instagram: {
      icon: ImageIcon,
      color: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
      label: 'Instagram',
    },
    x: {
      icon: ExternalLink,
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      label: 'X (Twitter)',
    },
  }

  const config = providerConfig[provider]
  const Icon = config.icon

  // iframe HTML에 보안 속성 추가
  const sanitizeEmbedHtml = (html: string, provider: 'youtube' | 'instagram' | 'x'): string => {
    if (!html) return html

    // 브라우저 환경에서만 실행
    if (typeof window === 'undefined') return html

    try {
      // 임시 div를 생성하여 HTML 파싱
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = html
      const iframe = tempDiv.querySelector('iframe')

      if (iframe) {
        // 보안 속성 추가
        // sandbox: 기본적으로 모든 권한 차단, 필요한 것만 허용
        const sandboxPermissions = [
          'allow-scripts',      // JavaScript 실행 허용
          'allow-same-origin',  // 같은 origin 접근 허용 (필수)
          'allow-popups',       // 팝업 허용 (일부 임베드에 필요)
          'allow-forms',        // 폼 제출 허용 (일부 임베드에 필요)
        ]

        // provider별 추가 권한
        if (provider === 'youtube') {
          sandboxPermissions.push('allow-presentation') // YouTube 플레이어에 필요
        }

        iframe.setAttribute('sandbox', sandboxPermissions.join(' '))
        
        // allow 속성: 필요한 기능만 허용
        const allowPermissions = [
          'accelerometer',
          'autoplay',
          'clipboard-write',
          'encrypted-media',
          'gyroscope',
          'picture-in-picture',
        ]
        iframe.setAttribute('allow', allowPermissions.join('; '))
        
        // referrerpolicy 추가
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade')
        
        // loading 속성 추가 (성능 최적화)
        iframe.setAttribute('loading', 'lazy')

        // 수정된 HTML 반환
        return tempDiv.innerHTML
      }
    } catch {
      // 파싱 실패 시 원본 HTML 반환
    }

    return html
  }

  // 확장/축소 토글 및 oembed HTML 가져오기
  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isExpanded) {
      // 이미 확장된 경우 축소
      setIsExpanded(false)
      return
    }

    // 확장하고 oembed HTML 가져오기
    setIsExpanded(true)
    
    // 이미 HTML이 있으면 다시 가져오지 않음
    if (embedHtml) {
      return
    }

    setIsLoadingEmbed(true)

    try {
      // oembed API에서 HTML 가져오기 (includeHtml=true를 문자열로 전달)
      const response = await fetch(`/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`)
      if (response.ok) {
        const data = await response.json()
        // 보안 속성이 추가된 HTML로 변환
        const sanitizedHtml = data.html ? sanitizeEmbedHtml(data.html, provider) : null
        setEmbedHtml(sanitizedHtml)
      } else {
        setEmbedHtml(null)
      }
    } catch {
      setEmbedHtml(null)
    } finally {
      setIsLoadingEmbed(false)
    }
  }

  return (
    <Card className={cn("border border-border bg-card overflow-hidden hover:border-muted-foreground/50 transition-colors", className)}>
      <CardContent className="p-0">
        {!isExpanded ? (
          // 미리보기 모드: 썸네일 표시
          <button
            onClick={handleToggleExpand}
            className="block w-full text-left"
          >
            {/* 썸네일 이미지 */}
            {thumbnail_url ? (
              <div className="relative w-full aspect-video bg-muted overflow-hidden group">
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
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md border backdrop-blur-sm",
                    config.color
                  )}>
                    <Icon className="h-3 w-3" />
                    <span className="text-xs font-medium">{config.label}</span>
                  </div>
                </div>
                {/* 재생 버튼 오버레이 (중앙) */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                  <div className="bg-white/90 rounded-full p-3 group-hover:scale-110 transition-transform">
                    <Play className="h-6 w-6 text-foreground ml-0.5" fill="currentColor" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full aspect-video bg-muted flex items-center justify-center">
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border",
                  config.color
                )}>
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
              </div>
            )}

            {/* 메타데이터 */}
            <div className="p-3 space-y-1.5">
              {title && (
                <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
                  {title}
                </h3>
              )}
              {author_name && (
                <p className="text-xs text-muted-foreground">
                  {author_name}
                </p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
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
              className="absolute top-2 right-2 z-10 bg-black/70 hover:bg-black/90 text-white rounded-full p-1.5 transition-colors"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>

            {isLoadingEmbed ? (
              <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">로딩 중...</p>
                </div>
              </div>
            ) : embedHtml ? (
              // oembed HTML 렌더링
              provider === 'instagram' ? (
                <InstagramPreviewEmbed html={embedHtml} />
              ) : provider === 'x' ? (
                <XPreviewEmbed html={embedHtml} url={url} author_name={author_name} />
              ) : (
                <div
                  className={cn(
                    "relative w-full rounded-lg overflow-hidden",
                    provider === 'youtube' && "aspect-video",
                  )}
                >
                  <div
                    className="w-full h-full [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:border-0"
                    dangerouslySetInnerHTML={{ __html: embedHtml }}
                  />
                </div>
              )
            ) : (
              // Fallback: 썸네일 이미지 확대 보기
              <div className="w-full">
                {thumbnail_url ? (
                  <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
                    <Image
                      src={thumbnail_url}
                      alt={title || `${config.label} 콘텐츠`}
                      fill
                      className="object-contain"
                      sizes="(max-width: 640px) 100vw, 560px"
                    />
                  </div>
                ) : (
                  <div className="relative w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border",
                      config.color
                    )}>
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                  </div>
                )}
                <div className="mt-4 text-center p-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    원본 보기
                  </a>
                </div>
              </div>
            )}

            {/* 메타데이터 (확장 모드에서도 표시) */}
            {(title || author_name) && (
              <div className="p-3 space-y-1.5 border-t border-border">
                {title && (
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">
                    {title}
                  </h3>
                )}
                {author_name && (
                  <p className="text-xs text-muted-foreground">
                    {author_name}
                  </p>
                )}
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
    type InstgrmWindow = Window & typeof globalThis & {
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
          if (win.instgrm) { clearInterval(interval); process() }
        }, 100)
        return
      }
      win.__igEmbedLoading = true
      const script = document.createElement('script')
      script.src = 'https://www.instagram.com/embed.js'
      script.async = true
      script.onload = () => { win.__igEmbedLoading = false; process() }
      document.body.appendChild(script)
    }, 0)

    return () => clearTimeout(timer)
  }, [html])

  return (
    <div
      ref={containerRef}
      className="max-w-[540px] mx-auto p-4 [&_.instagram-media]:!mx-auto"
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
function XPreviewEmbed({ html, url, author_name }: { html?: string; url?: string; author_name?: string }) {
  const linkUrl = url || ''

  // fxtwitter 커스텀 카드 HTML이 있으면 렌더링
  if (html && !html.includes('twitter-tweet')) {
    return (
      <div
        className="max-w-[550px] mx-auto p-4 [&_img]:rounded-xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  // 폴백: 링크 카드
  return (
    <div className="max-w-[550px] mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-foreground" aria-label="X">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        {author_name && <span className="text-sm font-medium text-foreground">{author_name}</span>}
      </div>
      {linkUrl && (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
          <ExternalLink className="h-4 w-4" />
          X에서 보기
        </a>
      )}
    </div>
  )
}

