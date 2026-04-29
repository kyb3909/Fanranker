"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import Link from "@/components/ui/app-link"
import { ExternalLink } from "lucide-react"
import useSWR from "swr"
import { formatRelativeTime } from "@/lib/utils/date"
import { formatCount } from "@/lib/utils/format"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import { extractFirstEmbedFromTipTapJSON, type EmbedNode } from "@/lib/utils/tiptap-embeds"
import type { TipTapNode } from "@/types/post"
import { extractYouTubeId } from "@/lib/embed/youtube"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

interface XOEmbedData {
  title?: string
  author_name?: string
  author_avatar?: string
  thumbnail_url?: string
  media?: { type: "photo" | "video"; url: string; thumbnail_url?: string }[]
}

const oembedFetcher = (u: string): Promise<XOEmbedData | null> =>
  fetch(u).then((r) => (r.ok ? r.json().catch(() => null) : null))

export interface MinimalPostInput {
  id: string
  community_slug: string | null
  title: string
  /** HTML 문자열 (legacy) 또는 TipTap JSON (현재). embed 추출은 JSON 형식에서만 동작. */
  content: string | TipTapNode | null
  vote_count: number | null
  comment_count: number | null
  created_at: string
  author_nickname?: string | null
}

const TRANSITION = "transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"

function htmlToExcerpt(html: string, max = 160): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
  if (stripped.length <= max) return stripped
  return stripped.slice(0, max) + "…"
}

function buildExcerpt(content: string | TipTapNode | null): string {
  if (!content) return ""
  if (typeof content === "string") return htmlToExcerpt(content)
  const text = extractTextFromTipTapJSON(content).trim()
  // 본문이 사실상 URL만 있는 경우(임베드만 붙여넣은 글) excerpt 생략 → embed 박스가 대신 표시.
  if (/^https?:\/\/\S+$/.test(text)) return ""
  return text.slice(0, 160).trim()
}

function getCommunityName(slug: string | null): string {
  if (!slug) return "general"
  return COMMUNITY_NAMES[slug] ?? slug
}

function getXHandle(url: string): string | null {
  const m = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status/i)
  return m ? m[1] : null
}

function getInstagramId(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

function getInstagramUser(url: string): string | null {
  const m = url.match(/instagram\.com\/([\w.]+)\/(?:p|reel)\//)
  return m ? m[1] : null
}

/**
 * Minimal Sport PostCard — 담벼락 피드 카드.
 *
 * Spec:
 * - white bg, 1px #ECECEC border, 16px radius, 18px 20px padding
 * - hover border #DBD8CF, transition 150ms
 * - meta(12 ink-3) → title(17 700 ink) → excerpt(13.5 ink-2 line-clamp-2)
 * - oEmbed 박스(X/Instagram/YouTube)는 본문에 임베드가 있을 때만
 * - vote pill + 댓글/공유/저장 액션 행
 */
export function MinimalPostCard({ post }: { post: MinimalPostInput }) {
  const router = useRouter()
  const excerpt = buildExcerpt(post.content)
  const time = formatRelativeTime(new Date(post.created_at))
  const author = post.author_nickname ?? "익명"
  const slug = post.community_slug
  const tagLabel = getCommunityName(slug)
  const score = post.vote_count ?? 0
  const comments = post.comment_count ?? 0
  const embed =
    typeof post.content === "object" && post.content
      ? extractFirstEmbedFromTipTapJSON(post.content)
      : null

  const handleClick = () => router.push(`/post/${post.id}`)

  return (
    <article
      className={`group flex cursor-pointer flex-col gap-2.5 rounded-2xl border bg-[var(--ms-surface)] px-5 py-4.5 ${TRANSITION} hover:border-[var(--ms-line-hover)]`}
      style={{ borderColor: "var(--ms-line)" }}
      onClick={handleClick}
    >
      {/* 1행 — 메타 */}
      <div
        className="flex items-center gap-2 text-[12px] font-medium"
        style={{ color: "var(--ms-ink-3)" }}
      >
        {slug && (
          <Link
            href={`/community/${slug}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{
              backgroundColor: "var(--ms-brand-soft)",
              color: "var(--ms-brand)",
            }}
          >
            {tagLabel}
          </Link>
        )}
        <span className="font-semibold" style={{ color: "var(--ms-ink-2)" }}>
          @{author}
        </span>
        <span aria-hidden>·</span>
        <span>{time}</span>
      </div>

      {/* 2행 — 제목 */}
      <h3
        className="text-[17px] leading-[1.35] font-bold"
        style={{ color: "var(--ms-ink)", letterSpacing: "-0.02em" }}
      >
        {post.title}
      </h3>

      {/* 3행 — 본문 미리보기 */}
      {excerpt && (
        <p
          className="line-clamp-2 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--ms-ink-2)" }}
        >
          {excerpt}
        </p>
      )}

      {/* 4행 — oEmbed 박스 (X / Instagram / YouTube) */}
      {embed && <EmbedBox embed={embed} onCardClick={(e) => e.stopPropagation()} />}

      {/* 5행 — 액션 */}
      <div
        className="mt-1 flex items-center gap-3.5 text-[12px] font-semibold"
        style={{ color: "var(--ms-ink-3)" }}
      >
        <span
          className="font-archivo inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 tabular-nums"
          style={{ backgroundColor: "var(--ms-bg-hover)" }}
        >
          <span aria-hidden>▲</span>
          <b style={{ color: "var(--ms-ink)" }}>{formatCount(score)}</b>
          <span aria-hidden>▼</span>
        </span>
        <span>💬 {formatCount(comments)}</span>
        <span>↗ 공유</span>
        <span>☆ 저장</span>
      </div>
    </article>
  )
}

/* ===== oEmbed 박스 ===== */

function EmbedBox({
  embed,
  onCardClick,
}: {
  embed: EmbedNode
  onCardClick: (e: React.MouseEvent) => void
}) {
  const { provider, url, author_name, thumbnail_url, title } = embed.attrs

  if (provider === "youtube") {
    return <YouTubeEmbedBox url={url} thumbnail_url={thumbnail_url} title={title} />
  }

  const handle = provider === "x" ? getXHandle(url) : null
  const igId = provider === "instagram" ? getInstagramId(url) : null

  return (
    <div
      onClick={onCardClick}
      className="relative overflow-hidden"
      style={{
        borderRadius: 14,
        border: "1.5px solid var(--ms-line)",
        backgroundColor: "var(--ms-surface)",
      }}
    >
      {/* 좌측 액센트 바 */}
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-0 w-[4px]"
        style={{
          background:
            provider === "instagram"
              ? "linear-gradient(180deg, #f09433, #dc2743, #bc1888)"
              : "#000000",
        }}
      />

      {/* 출처 헤더 */}
      <header
        className="flex items-center gap-2 border-b py-2 pr-4 pl-[18px] text-[11px] font-bold"
        style={{
          borderColor: "var(--ms-line)",
          backgroundColor: "#FAFAF7",
          color: "var(--ms-ink-2)",
        }}
      >
        <ProviderBadge provider={provider} />
        <span>
          {provider === "x" ? "X (Twitter)에서 퍼온 게시물" : "Instagram에서 퍼온 게시물"}
        </span>
        {handle && (
          <>
            <span aria-hidden style={{ color: "var(--ms-ink-3)" }}>
              ·
            </span>
            <span style={{ color: "var(--ms-ink-3)", fontWeight: 600 }}>x.com/{handle}</span>
          </>
        )}
        {!handle && igId && (
          <>
            <span aria-hidden style={{ color: "var(--ms-ink-3)" }}>
              ·
            </span>
            <span style={{ color: "var(--ms-ink-3)", fontWeight: 600 }}>
              instagram.com/p/{igId}
            </span>
          </>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`ml-auto inline-flex items-center gap-1 ${TRANSITION} hover:opacity-70`}
          style={{ color: "var(--ms-ink-2)" }}
        >
          원본 보기
          <ExternalLink className="h-3 w-3" />
        </a>
      </header>

      {/* 본문 */}
      {provider === "x" ? (
        <XEmbedBody url={url} author_name={author_name} handle={handle} />
      ) : (
        <InstagramEmbedBody url={url} author_name={author_name} thumbnail_url={thumbnail_url} />
      )}
    </div>
  )
}

function ProviderBadge({ provider }: { provider: "x" | "instagram" }) {
  if (provider === "x") {
    return (
      <span
        aria-hidden
        className="font-archivo inline-flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-black text-white"
        style={{ backgroundColor: "#000000", borderRadius: 3 }}
      >
        𝕏
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0"
      style={{
        background: "linear-gradient(135deg, #f09433, #dc2743, #bc1888)",
        borderRadius: 3,
      }}
    />
  )
}

function XEmbedBody({
  url,
  author_name: nameFromAttrs,
  handle,
}: {
  url: string
  author_name?: string
  handle: string | null
}) {
  const { data, isLoading } = useSWR<XOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    oembedFetcher,
    { dedupingInterval: 600_000, revalidateOnFocus: false, revalidateIfStale: false }
  )
  const displayName =
    data?.author_name?.trim() || nameFromAttrs?.trim() || (handle ? `@${handle}` : "X 사용자")
  const tweetText = data?.title?.trim() || ""
  const avatar = data?.author_avatar
  const firstMedia = data?.media?.[0]

  return (
    <div className="flex flex-col gap-2.5 py-3.5 pr-4 pl-[18px]">
      {/* 헤더: 아바타 + 이름 + verify + 핸들 + 𝕏 로고 */}
      <div className="flex items-center gap-2.5">
        {avatar ? (
          <Image
            src={avatar}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
            unoptimized
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        ) : (
          <div
            aria-hidden
            className="h-9 w-9 shrink-0 rounded-full"
            style={{ background: "linear-gradient(135deg, #1f2937, #4b5563)" }}
          />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-[14px] font-extrabold" style={{ color: "var(--ms-ink)" }}>
            {displayName}
          </span>
          <VerifyBadge />
          {handle && (
            <span className="ml-1 truncate text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
              @{handle}
            </span>
          )}
        </div>
        <span
          aria-hidden
          className="font-archivo text-[18px] font-black"
          style={{ color: "var(--ms-ink)" }}
        >
          𝕏
        </span>
      </div>

      {/* 트윗 본문 텍스트 (해시태그/링크 컬러링) */}
      {isLoading ? (
        <div
          className="h-[1.05rem] w-3/4 animate-pulse rounded"
          style={{ backgroundColor: "var(--ms-bg-hover)" }}
        />
      ) : tweetText ? (
        <p
          className="text-[14px] leading-[1.5] whitespace-pre-wrap"
          style={{ color: "var(--ms-ink)" }}
        >
          {renderTweetText(tweetText)}
        </p>
      ) : (
        <p className="text-[14px]" style={{ color: "var(--ms-ink-3)" }}>
          트윗을 불러올 수 없습니다.
        </p>
      )}

      {/* 미디어 */}
      {firstMedia && (
        <div
          className="relative aspect-video w-full overflow-hidden bg-black"
          style={{ borderRadius: 12 }}
        >
          <Image
            src={
              firstMedia.type === "photo"
                ? firstMedia.url
                : firstMedia.thumbnail_url || firstMedia.url
            }
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 560px"
            unoptimized
          />
        </div>
      )}
    </div>
  )
}

function InstagramEmbedBody({
  url,
  author_name: nameFromAttrs,
  thumbnail_url: thumbFromAttrs,
}: {
  url: string
  author_name?: string
  thumbnail_url?: string
}) {
  const { data, isLoading } = useSWR<XOEmbedData | null>(
    `/api/oembed?url=${encodeURIComponent(url)}`,
    oembedFetcher,
    { dedupingInterval: 600_000, revalidateOnFocus: false, revalidateIfStale: false }
  )
  const igUser = getInstagramUser(url)
  const displayName =
    data?.author_name?.trim() ||
    nameFromAttrs?.trim() ||
    (igUser ? `@${igUser}` : "Instagram 게시물")
  const thumb = data?.thumbnail_url || data?.media?.[0]?.url || thumbFromAttrs
  const caption = data?.title?.trim()

  return (
    <div className="flex flex-col gap-2.5 py-3.5 pr-4 pl-[18px]">
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden
          className="h-9 w-9 shrink-0 rounded-full"
          style={{
            background: "linear-gradient(135deg, #f09433, #dc2743, #bc1888)",
          }}
        />
        <span className="truncate text-[14px] font-extrabold" style={{ color: "var(--ms-ink)" }}>
          {displayName}
        </span>
      </div>

      {isLoading && !thumb ? (
        <div
          className="h-[200px] w-full animate-pulse"
          style={{ borderRadius: 12, backgroundColor: "var(--ms-bg-hover)" }}
        />
      ) : thumb ? (
        <div className="relative overflow-hidden" style={{ borderRadius: 12 }}>
          <Image
            src={thumb}
            alt=""
            width={600}
            height={600}
            className="h-auto w-full"
            unoptimized
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="flex h-[180px] items-center justify-center text-3xl text-white/70"
          style={{
            borderRadius: 12,
            background: "linear-gradient(135deg, #1f2937, #4b5563)",
          }}
        >
          📷
        </div>
      )}

      {caption && (
        <p
          className="line-clamp-3 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--ms-ink-2)" }}
        >
          {caption}
        </p>
      )}
    </div>
  )
}

/** 트윗 텍스트에서 해시태그/멘션/링크를 #1d9bf0 컬러로 inline 처리. */
function renderTweetText(text: string) {
  const parts = text.split(/(\s+)/)
  return parts.map((p, i) => {
    if (/^[#@][\w가-힣]+/.test(p)) {
      return (
        <span key={i} style={{ color: "#1d9bf0", fontWeight: 600 }}>
          {p}
        </span>
      )
    }
    if (/^https?:\/\/\S+/.test(p)) {
      return (
        <span key={i} style={{ color: "#1d9bf0" }}>
          {p}
        </span>
      )
    }
    return <span key={i}>{p}</span>
  })
}

function YouTubeEmbedBox({
  url,
  thumbnail_url,
  title,
}: {
  url: string
  thumbnail_url?: string
  title?: string
}) {
  const videoId = extractYouTubeId(url)
  const thumb =
    thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null)
  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 14,
        border: "1.5px solid var(--ms-line)",
        backgroundColor: "#000",
      }}
    >
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-0 z-10 w-[4px]"
        style={{ backgroundColor: "#FF0000" }}
      />
      {thumb ? (
        <div className="relative aspect-video w-full">
          <Image src={thumb} alt={title || ""} fill className="object-cover" unoptimized />
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center bg-black/30"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
              <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-[1px] fill-white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-neutral-900 text-sm text-white/70">
          YouTube 영상
        </div>
      )}
    </div>
  )
}

function VerifyBadge() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      style={{ color: "#1d9bf0" }}
    >
      <path
        fill="currentColor"
        d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334-4.334 6.5c-.144.216-.382.348-.638.355h-.018c-.25 0-.485-.115-.64-.314l-2.156-2.785c-.272-.351-.21-.857.14-1.128.354-.272.86-.21 1.128.141l1.49 1.928 3.815-5.92c.255-.376.755-.473 1.13-.218.378.255.474.755.218 1.13z"
      />
    </svg>
  )
}
