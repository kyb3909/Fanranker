"use client"

import Link from "@/components/ui/app-link"
import { Eye, MessageSquare, ThumbsUp } from "lucide-react"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

export interface MinimalPostListItemData {
  id: string
  title: string
  community_slug: string | null
  upvotes?: number
  comments?: number
  views?: number
}

/**
 * Minimal Sport 단순 list row (운동장/게시판 트렌딩용).
 * PostCard보다 간략 — 제목 + 커뮤니티 + 카운터(upvotes/comments/views).
 */
export function MinimalPostListItem({ post }: { post: MinimalPostListItemData }) {
  const community = post.community_slug
    ? (COMMUNITY_NAMES[post.community_slug] ?? post.community_slug)
    : ""
  return (
    <Link
      href={`/post/${post.id}`}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--ms-bg)]"
    >
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[13.5px] leading-tight font-medium"
          style={{ color: "var(--ms-ink)" }}
        >
          {post.title}
        </p>
        {community && (
          <span
            className="mt-0.5 block text-[11px] font-medium"
            style={{ color: "var(--ms-ink-3)" }}
          >
            {community}
          </span>
        )}
      </div>
      <div
        className="font-archivo flex shrink-0 items-center gap-3 text-[11px] font-bold tabular-nums"
        style={{ color: "var(--ms-ink-3)" }}
      >
        <span className="flex items-center gap-1" style={{ color: "var(--ms-brand)" }}>
          <ThumbsUp className="h-3 w-3" />
          {post.upvotes ?? 0}
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {post.comments ?? 0}
        </span>
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {post.views ?? 0}
        </span>
      </div>
    </Link>
  )
}
