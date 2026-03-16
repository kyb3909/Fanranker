"use client"

import Image from "next/image"
import Link from "next/link"
import { EmbedPreviewCard } from "@/components/editor/embed-preview-card"
import type { TipTapNode } from "@/components/post-card"

/**
 * TipTap JSON에서 텍스트만 추출 (피드 미리보기용)
 */
function extractTextFromTipTapJSON(content: TipTapNode): string {
  if (!content || typeof content !== "object") {
    return ""
  }

  if (content.type === "text" && content.text) {
    return content.text
  }

  if (Array.isArray(content.content)) {
    return content.content.map((node) => extractTextFromTipTapJSON(node)).join(" ")
  }

  return ""
}

export interface PostCardContentProps {
  postId: number | string
  title: string
  content: string | TipTapNode
  displayImage: string | null
  firstEmbed: {
    attrs: {
      provider: "youtube" | "instagram" | "x"
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
      <Link href={`/post/${postId}`} className="group block">
        <h2 className="text-foreground group-hover:text-primary line-clamp-2 text-[16px] leading-[1.4] font-semibold transition-colors sm:text-[17px]">
          {title}
        </h2>
      </Link>

      {/* 본문 */}
      {typeof content === "string" ? (
        <p className="text-foreground/80 line-clamp-2 text-[14px] leading-[1.6]">{content}</p>
      ) : (
        <p className="text-foreground/80 line-clamp-2 text-[14px] leading-[1.6]">
          {extractTextFromTipTapJSON(content)}
        </p>
      )}

      {/* 이미지 또는 임베드 미리보기 (피드용) */}
      {displayImage && !firstEmbed && (
        <Link href={`/post/${postId}`} className="mt-2 block">
          <div className="bg-muted flex max-h-[400px] w-full items-center justify-center overflow-hidden rounded-lg transition-opacity hover:opacity-95">
            <Image
              src={displayImage}
              alt={title || "Post image"}
              width={560}
              height={400}
              className="h-auto max-h-[400px] w-full object-contain"
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
            />
          </div>
        </Link>
      )}

      {/* 임베드 (피드용) - YouTube는 바로 재생, 나머지는 미리보기 */}
      {firstEmbed && !image && (
        <div className="mt-2">
          <EmbedPreviewCard
            provider={firstEmbed.attrs.provider}
            url={firstEmbed.attrs.url}
            title={firstEmbed.attrs.title}
            thumbnail_url={firstEmbed.attrs.thumbnail_url}
            author_name={firstEmbed.attrs.author_name}
            priority={priority}
            autoExpand={firstEmbed.attrs.provider === "youtube"}
          />
        </div>
      )}
    </div>
  )
}
