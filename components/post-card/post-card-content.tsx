"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { EmbedPreviewCard } from "@/components/editor/embed-preview-card"
import { Play } from "lucide-react"
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
          {firstEmbed.attrs.provider === "youtube" ? (
            <YouTubeInlinePlayer
              url={firstEmbed.attrs.url}
              thumbnail_url={firstEmbed.attrs.thumbnail_url}
              title={firstEmbed.attrs.title}
              priority={priority}
            />
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

/* ── YouTube 인라인 플레이어 (Reddit 스타일) ── */

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  )
  return m ? m[1] : null
}

function YouTubeInlinePlayer({
  url,
  thumbnail_url,
  title,
  priority,
}: {
  url: string
  thumbnail_url?: string
  title?: string
  priority: boolean
}) {
  const [playing, setPlaying] = useState(false)
  const videoId = extractYouTubeId(url)

  const thumb =
    thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null)

  const handlePlay = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPlaying(true)
  }, [])

  if (!videoId) return null

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button onClick={handlePlay} className="group block h-full w-full">
          {thumb && (
            <Image
              src={thumb}
              alt={title || "YouTube"}
              fill
              className="object-cover"
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 560px"
            />
          )}
          {/* 재생 버튼 */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
            <div className="flex h-[48px] w-[68px] items-center justify-center rounded-xl bg-red-600/90 shadow-lg transition-opacity group-hover:bg-red-600">
              <Play className="ml-0.5 h-6 w-6 text-white" fill="white" />
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
