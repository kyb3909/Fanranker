"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import useSWR from "swr"
import { EmbedPreviewCard } from "@/components/editor/embed-preview-card"
import { Play, ExternalLink } from "lucide-react"
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
          ) : firstEmbed.attrs.provider === "x" ? (
            <XInlinePreview url={firstEmbed.attrs.url} />
          ) : firstEmbed.attrs.provider === "instagram" ? (
            <InstagramInlinePreview url={firstEmbed.attrs.url} />
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

/* ── X (Twitter) 인라인 프리뷰 ── */

const oembedFetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null))

interface XOEmbedData {
  title?: string
  author_name?: string
  author_avatar?: string
  thumbnail_url?: string
  media?: { type: "photo" | "video"; url: string; thumbnail_url?: string }[]
}

function XInlinePreview({ url }: { url: string }) {
  const { data, isLoading } = useSWR<XOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    oembedFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  )

  if (isLoading) {
    return (
      <div className="bg-muted animate-pulse rounded-lg p-4">
        <div className="flex items-center gap-2">
          <div className="bg-muted-foreground/20 h-8 w-8 rounded-full" />
          <div className="bg-muted-foreground/20 h-4 w-24 rounded" />
        </div>
        <div className="bg-muted-foreground/20 mt-3 h-4 w-full rounded" />
        <div className="bg-muted-foreground/20 mt-2 h-4 w-3/4 rounded" />
        <div className="bg-muted-foreground/20 mt-3 aspect-video w-full rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary flex items-center gap-1.5 text-sm hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        X에서 보기
      </a>
    )
  }

  const firstMedia = data.media?.[0]

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        {data.author_avatar ? (
          <img src={data.author_avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <div className="bg-muted-foreground/30 h-6 w-6 rounded-full" />
        )}
        <span className="text-foreground text-sm font-medium">{data.author_name}</span>
        <svg viewBox="0 0 24 24" className="fill-foreground ml-auto h-4 w-4 opacity-60">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>

      {/* 트윗 텍스트 */}
      {data.title && (
        <p className="text-foreground/90 line-clamp-3 px-3 pt-1 pb-2 text-sm leading-relaxed">
          {data.title}
        </p>
      )}

      {/* 미디어 */}
      {firstMedia && <XInlineMedia media={firstMedia} />}

      {/* 푸터 */}
      <div className="px-3 py-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground flex items-center gap-1 text-xs hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          X에서 보기
        </a>
      </div>
    </div>
  )
}

function XInlineMedia({
  media,
}: {
  media: { type: "photo" | "video"; url: string; thumbnail_url?: string }
}) {
  const [playing, setPlaying] = useState(false)

  if (media.type === "photo") {
    return (
      <div className="relative aspect-video w-full overflow-hidden">
        <img src={media.url} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      {playing ? (
        <video
          src={media.url}
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

/* ── Instagram 인라인 프리뷰 ── */

function InstagramInlinePreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useSWR<{ html?: string } | null>(
    `/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`,
    oembedFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  )

  useEffect(() => {
    if (!data?.html) return

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
  }, [data?.html])

  if (isLoading) {
    return (
      <div className="bg-muted flex aspect-square max-h-[480px] w-full animate-pulse items-center justify-center rounded-lg">
        <div className="text-center">
          <div className="border-primary mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-b-2" />
          <p className="text-muted-foreground text-xs">Instagram 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!data?.html) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary flex items-center gap-1.5 text-sm hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Instagram에서 보기
      </a>
    )
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-lg [&_.instagram-media]:!mx-0 [&_.instagram-media]:!w-full [&_.instagram-media]:!max-w-full [&_.instagram-media]:!min-w-0"
      style={{ minHeight: 300 }}
      dangerouslySetInnerHTML={{ __html: data.html }}
    />
  )
}
