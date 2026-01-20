"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ExternalLink, Play, Image as ImageIcon } from "lucide-react"
import Link from "next/link"

export interface EmbedPreviewCardProps {
  provider: 'youtube' | 'instagram' | 'x'
  url: string
  title?: string
  thumbnail_url?: string
  author_name?: string
  className?: string
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
}: EmbedPreviewCardProps) {
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

  return (
    <Card className={cn("border border-border bg-card overflow-hidden hover:border-muted-foreground/50 transition-colors", className)}>
      <Link
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <CardContent className="p-0">
          {/* 썸네일 이미지 */}
          {thumbnail_url ? (
            <div className="relative w-full aspect-video bg-muted overflow-hidden">
              <img
                src={thumbnail_url}
                alt={title || `${config.label} 콘텐츠`}
                className="w-full h-full object-cover"
                loading="lazy"
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
        </CardContent>
      </Link>
    </Card>
  )
}

