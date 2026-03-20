"use client"

import Image from "next/image"
import Link from "next/link"
import { EmbedPreviewCard } from "@/components/editor/embed-preview-card"
import { Play, ExternalLink, Image as ImageIcon } from "lucide-react"
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

      {/* 임베드 (피드용) */}
      {firstEmbed && !image && (
        <div className="mt-2">
          {firstEmbed.attrs.provider === "youtube" && firstEmbed.attrs.thumbnail_url ? (
            <Link href={`/post/${postId}`} className="group block">
              <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-lg">
                <Image
                  src={firstEmbed.attrs.thumbnail_url}
                  alt={firstEmbed.attrs.title || "YouTube"}
                  fill
                  className="object-cover transition-transform group-hover:scale-[1.02]"
                  priority={priority}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform group-hover:scale-110">
                    <Play className="ml-1 h-7 w-7 text-white" fill="white" />
                  </div>
                </div>
                <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2.5">
                  {firstEmbed.attrs.title && (
                    <p className="line-clamp-2 text-sm leading-snug font-medium text-white">
                      {firstEmbed.attrs.title}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-white/70">YouTube</p>
                </div>
              </div>
            </Link>
          ) : (
            <EmbedPreviewCard
              provider={firstEmbed.attrs.provider}
              url={firstEmbed.attrs.url}
              title={firstEmbed.attrs.title}
              thumbnail_url={firstEmbed.attrs.thumbnail_url}
              author_name={firstEmbed.attrs.author_name}
              priority={priority}
            />
          )}
        </div>
      )}
    </div>
  )
}
