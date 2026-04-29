"use client"

import { useMemo } from "react"
import Link from "@/components/ui/app-link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { MinimalShell } from "./minimal-shell"
import { MinimalTopbar } from "./minimal-topbar"
import { MinimalSidebar } from "./minimal-sidebar"
import { MinimalRightAside } from "./minimal-right-aside"
import { MinimalPostCard, type MinimalPostInput } from "./minimal-post-card"
import { MinimalPrizeCard } from "./minimal-prize-card"
import { MinimalTalkList, type TalkItem } from "./minimal-talk-list"

interface RawCategory {
  id: number | string
  slug: string
  name: string
  icon?: string | null
  sort_order: number
  parent_slug?: string | null
}

interface CommunityHeader {
  name: string
  slug: string
  members?: string
  description?: string | null
}

interface ChannelLink {
  slug: string
  name: string
  icon?: string | null
}

interface FlairInfo {
  id: string
  name: string
  color: string
}

export interface MinimalCommunityContentProps {
  community: CommunityHeader
  /** transformPosts 결과 — 새 PostCard에 매핑 */
  posts: Array<{
    id: string
    title: string
    content: unknown
    communitySlug?: string
    author?: string
    upvotes?: number
    comments?: number
    createdAt?: Date | string
  }>
  channels?: ChannelLink[]
  flairs?: FlairInfo[]
  activeFlairId?: string | null
  currentPage: number
  totalPages: number
  totalCount: number
  categories: RawCategory[]
  recentComments: TalkItem[]
}

function groupCategories(cats: RawCategory[]) {
  const parents = cats.filter((c) => !c.parent_slug)
  const sports = parents
    .filter((c) => c.sort_order <= 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  const life = parents
    .filter((c) => c.sort_order > 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  return { sports, life }
}

function postToMinimalInput(p: {
  id: string
  title: string
  content: unknown
  communitySlug?: string
  author?: string
  upvotes?: number
  comments?: number
  createdAt?: Date | string
}): MinimalPostInput {
  const created =
    p.createdAt instanceof Date ? p.createdAt : p.createdAt ? new Date(p.createdAt) : new Date()
  return {
    id: String(p.id),
    community_slug: p.communitySlug ?? null,
    title: p.title,
    content: typeof p.content === "string" ? p.content : null,
    vote_count: p.upvotes ?? 0,
    comment_count: p.comments ?? 0,
    created_at: created.toISOString(),
    author_nickname: p.author ?? "익명",
  }
}

/**
 * 게시판(/community/[slug]) 메인 — Minimal Sport 디자인.
 *
 * 데스크톱(lg+) 전용. 모바일/태블릿은 부모 page.tsx에서 기존 layout 그대로.
 * 담벼락/예측/운동장과 같은 셸 사용 → 통일성. NewsTicker는 셸 외부에서
 * 별도 page-level 렌더 (현 디자인 차별화 유지).
 */
export function MinimalCommunityContent({
  community,
  posts,
  channels,
  flairs,
  activeFlairId,
  currentPage,
  totalPages,
  totalCount,
  categories,
  recentComments,
}: MinimalCommunityContentProps) {
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])
  const minimalPosts = useMemo(() => posts.map(postToMinimalInput), [posts])

  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  const baseHref = `/community/${community.slug}`
  const flairParam = activeFlairId ? `&flair=${activeFlairId}` : ""

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="담벼락" />}
      sidebar={<MinimalSidebar sports={sports} life={life} activeSlug={community.slug} />}
      aside={
        <MinimalRightAside>
          <MinimalPrizeCard />
          <MinimalTalkList items={recentComments} />
        </MinimalRightAside>
      }
    >
      {/* Crumb + Heading */}
      <div className="mb-5">
        <div className="text-[13px]" style={{ color: "var(--ms-ink-3)" }}>
          담벼락 ·{" "}
          <b className="font-semibold" style={{ color: "var(--ms-ink-2)" }}>
            {community.name}
          </b>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1
            className="text-[28px] leading-[1.15] font-extrabold"
            style={{ color: "var(--ms-ink)", letterSpacing: "-0.035em" }}
          >
            {community.name}
          </h1>
          {community.members && (
            <span
              className="font-archivo pb-1 text-[12px] font-bold tabular-nums"
              style={{ color: "var(--ms-ink-3)" }}
            >
              👥 {community.members}
            </span>
          )}
        </div>
        {community.description && (
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--ms-ink-2)" }}>
            {community.description}
          </p>
        )}
      </div>

      {/* 채널 (sub-categories) */}
      {channels && channels.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-2">
          {channels.map((ch) => (
            <Link
              key={ch.slug}
              href={`/community/${ch.slug}`}
              className="flex items-center gap-2 rounded-xl border bg-[var(--ms-surface)] px-3 py-2.5 transition-colors hover:border-[var(--ms-line-hover)]"
              style={{ borderColor: "var(--ms-line)" }}
            >
              <span className="text-[16px]" aria-hidden>
                {ch.icon ?? "📺"}
              </span>
              <span className="truncate text-[13px] font-bold" style={{ color: "var(--ms-ink)" }}>
                {ch.name}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Flair 필터 */}
      {flairs && flairs.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <Link
            href={baseHref}
            className="flex h-8 items-center rounded-full border px-3.5 text-[12px] font-semibold transition-colors hover:border-[var(--ms-line-hover)]"
            style={{
              backgroundColor: !activeFlairId ? "var(--ms-ink)" : "var(--ms-surface)",
              borderColor: !activeFlairId ? "var(--ms-ink)" : "var(--ms-line)",
              color: !activeFlairId ? "#ffffff" : "var(--ms-ink-2)",
            }}
          >
            전체
          </Link>
          {flairs.map((f) => {
            const isActive = activeFlairId === f.id
            return (
              <Link
                key={f.id}
                href={`${baseHref}?flair=${f.id}`}
                className="flex h-8 items-center rounded-full border px-3.5 text-[12px] font-semibold transition-colors hover:border-[var(--ms-line-hover)]"
                style={{
                  backgroundColor: isActive ? "var(--ms-ink)" : "var(--ms-surface)",
                  borderColor: isActive ? "var(--ms-ink)" : "var(--ms-line)",
                  color: isActive ? "#ffffff" : "var(--ms-ink-2)",
                }}
              >
                {f.name}
              </Link>
            )
          })}
        </div>
      )}

      {/* Post list */}
      {minimalPosts.length === 0 ? (
        <div
          className="rounded-2xl border bg-[var(--ms-surface)] py-10 text-center text-[13px]"
          style={{ borderColor: "var(--ms-line)", color: "var(--ms-ink-3)" }}
        >
          아직 게시물이 없어요.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {minimalPosts.map((p) => (
            <MinimalPostCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="페이지 이동">
          {hasPrev ? (
            <Link
              href={`${baseHref}?page=${currentPage - 1}${flairParam}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:border-[var(--ms-ink)]"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-line)",
                color: "var(--ms-ink-2)",
              }}
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg border opacity-40"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-line)",
                color: "var(--ms-ink-3)",
              }}
              aria-hidden
            >
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span
            className="font-archivo px-3 text-[13px] font-bold tabular-nums"
            style={{ color: "var(--ms-ink)" }}
          >
            {currentPage} / {totalPages}
          </span>
          {hasNext ? (
            <Link
              href={`${baseHref}?page=${currentPage + 1}${flairParam}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:border-[var(--ms-ink)]"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-line)",
                color: "var(--ms-ink-2)",
              }}
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg border opacity-40"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-line)",
                color: "var(--ms-ink-3)",
              }}
              aria-hidden
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </nav>
      )}

      {totalCount > 0 && (
        <p
          className="mt-3 text-center text-[11px] font-medium"
          style={{ color: "var(--ms-ink-3)" }}
        >
          전체 {totalCount.toLocaleString()}개
        </p>
      )}
    </MinimalShell>
  )
}
