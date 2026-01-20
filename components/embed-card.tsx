"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

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
                <img
                  src={thumbnail_url}
                  alt={title || 'Embed preview'}
                  className="w-full h-full object-cover"
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

  // Render embed HTML with responsive wrapper
  return (
    <Card className={cn("border border-border bg-card overflow-hidden", className)}>
      <CardContent className="p-0">
        <div
          className={cn(
            "relative w-full",
            // Responsive aspect ratio for video embeds
            provider === 'youtube' && "aspect-video",
            provider === 'instagram' && "aspect-square max-w-md mx-auto",
            provider === 'x' && "min-h-[400px]"
          )}
        >
          {/* Embed HTML container */}
          <div
            className="w-full h-full [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:border-0"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        
        {/* Optional metadata footer */}
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

