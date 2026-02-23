"use client"

import Image from "next/image"
import Link from "next/link"
import { EmbedPreviewCard } from "@/components/embed-preview-card"
import type { TipTapNode } from "@/components/post-card"

/**
 * TipTap JSON에서 텍스트만 추출 (피드 미리보기용)
 */
function extractTextFromTipTapJSON(content: TipTapNode): string {
  if (!content || typeof content !== 'object') {
    return ''
  }

  if (content.type === 'text' && content.text) {
    return content.text
  }

  if (Array.isArray(content.content)) {
    return content.content
      .map((node) => extractTextFromTipTapJSON(node))
      .join(' ')
  }

  return ''
}

export interface PostCardContentProps {
  postId: number | string
  title: string
  content: string | TipTapNode
  displayImage: string | null
  firstEmbed: {
    attrs: {
      provider: 'youtube' | 'instagram' | 'x'
      url: string
      title?: string
      thumbnail_url?: string
      author_name?: string
    }
  } | null
  image?: string
  priority: boolean
}

export function PostCardContent({
  postId,
  title,
  content,
  displayImage,
  firstEmbed,
  image,
  priority,
}: PostCardContentProps) {
  return (
    <div className="space-y-2.5">
      {/* 제목 */}
      <Link href={`/post/${postId}`} className="block group">
        <h2 className="text-[16px] sm:text-[17px] font-semibold text-foreground leading-[1.4] group-hover:text-primary transition-colors line-clamp-2">
          {title}
        </h2>
      </Link>

      {/* 본문 */}
      {typeof content === 'string' ? (
        <p className="text-[14px] text-foreground/80 leading-[1.6] line-clamp-2">
          {content}
        </p>
      ) : (
        <p className="text-[14px] text-foreground/80 leading-[1.6] line-clamp-2">
          {extractTextFromTipTapJSON(content)}
        </p>
      )}

      {/* 이미지 또는 임베드 미리보기 (피드용) */}
      {displayImage && !firstEmbed && (
        <Link href={`/post/${postId}`} className="block mt-2">
          <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted hover:opacity-95 transition-opacity">
            <Image
              src={displayImage}
              alt={title || "Post image"}
              fill
              className="object-cover"
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
            />
          </div>
        </Link>
      )}

      {/* 임베드 미리보기 (피드용) - 이미지가 없을 때만 표시 */}
      {firstEmbed && !image && (
        <div className="mt-2">
          <EmbedPreviewCard
            provider={firstEmbed.attrs.provider}
            url={firstEmbed.attrs.url}
            title={firstEmbed.attrs.title}
            thumbnail_url={firstEmbed.attrs.thumbnail_url}
            author_name={firstEmbed.attrs.author_name}
            priority={priority}
          />
        </div>
      )}
    </div>
  )
}
