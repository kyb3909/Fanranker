"use client"

import { useRouter } from "next/navigation"
import Link from "@/components/ui/app-link"
import { formatRelativeTime } from "@/lib/utils/date"
import { formatCount } from "@/lib/utils/format"

export interface MinimalPostInput {
  id: string
  community_slug: string | null
  title: string
  content: string | null
  vote_count: number | null
  comment_count: number | null
  created_at: string
  author_nickname?: string | null
}

function htmlToExcerpt(html: string | null, max = 140): string {
  if (!html) return ""
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

/**
 * Minimal Sport PostCard.
 *
 * Spec (핸드오프):
 * - card: surface, 1px line, 16px radius, 18×20 padding
 * - head: tag · @author · 시간 (12px ink-3)
 * - title: 17px/700
 * - excerpt: 13.5px ink-2, line-clamp-2
 * - actions: vote pill / comments / share / save
 * - hover: border-color line-hover
 */
export function MinimalPostCard({ post }: { post: MinimalPostInput }) {
  const router = useRouter()
  const excerpt = htmlToExcerpt(post.content)
  const time = formatRelativeTime(new Date(post.created_at))
  const author = post.author_nickname ?? "익명"
  const tag = post.community_slug ?? "general"
  const score = post.vote_count ?? 0
  const comments = post.comment_count ?? 0

  const handleClick = () => router.push(`/post/${post.id}`)

  return (
    <article
      className="group flex cursor-pointer flex-col gap-2.5 rounded-2xl border bg-[var(--ms-surface)] px-5 py-4.5 transition-colors hover:border-[var(--ms-line-hover)]"
      style={{ borderColor: "var(--ms-line)" }}
      onClick={handleClick}
    >
      {/* Head: tag · author · time */}
      <div
        className="flex items-center gap-2 text-[12px] font-medium"
        style={{ color: "var(--ms-ink-3)" }}
      >
        <Link
          href={`/community/${tag}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{
            backgroundColor: "var(--ms-brand-soft)",
            color: "var(--ms-brand)",
          }}
        >
          {tag}
        </Link>
        <span>@{author}</span>
        <span>·</span>
        <span>{time}</span>
      </div>

      {/* Title */}
      <h3
        className="text-[17px] leading-tight font-bold"
        style={{ color: "var(--ms-ink)", letterSpacing: "-0.02em" }}
      >
        {post.title}
      </h3>

      {/* Excerpt */}
      {excerpt && (
        <p
          className="line-clamp-2 text-[13.5px] leading-relaxed"
          style={{ color: "var(--ms-ink-2)" }}
        >
          {excerpt}
        </p>
      )}

      {/* Actions */}
      <div
        className="mt-1 flex items-center gap-3 text-[12px] font-medium"
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
