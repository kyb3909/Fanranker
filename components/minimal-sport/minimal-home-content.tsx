"use client"

import { useMemo } from "react"
import type { Post } from "@/types/post"
import type { SortType } from "@/hooks/use-feed"
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

interface MinimalHomeContentProps {
  posts: Post[]
  sortBy: SortType
  setSortBy: (s: SortType) => void
  categories: RawCategory[]
  recentComments: TalkItem[]
  isLoading?: boolean
}

const SORT_OPTIONS: { key: SortType; label: string }[] = [
  { key: "random", label: "랜덤" },
  { key: "hot", label: "온도순" },
  { key: "new", label: "최신순" },
]

function groupCategories(cats: RawCategory[]): {
  sports: { slug: string; name: string; icon?: string | null }[]
  life: { slug: string; name: string; icon?: string | null }[]
} {
  const parents = cats.filter((c) => !c.parent_slug)
  const sports = parents
    .filter((c) => c.sort_order <= 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  const life = parents
    .filter((c) => c.sort_order > 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  return { sports, life }
}

function postToMinimalInput(p: Post): MinimalPostInput {
  const created =
    p.createdAt instanceof Date ? p.createdAt : p.createdAt ? new Date(p.createdAt) : new Date()
  return {
    id: String(p.id),
    community_slug: p.communitySlug ?? null,
    title: p.title,
    content: typeof p.content === "string" ? p.content : null,
    vote_count: p.upvotes,
    comment_count: p.comments,
    created_at: created.toISOString(),
    author_nickname: p.author,
  }
}

/**
 * 담벼락(/) 메인 — Minimal Sport 디자인.
 *
 * 데스크톱(lg+) 전용. 모바일/태블릿은 부모 HomeClient에서 기존 디자인 유지.
 *
 * 내부 state(sortBy 등)는 부모 HomeClient에서 관리하고 prop으로 받음 →
 * 모바일·데스크톱 두 디자인이 같은 state 공유.
 */
export function MinimalHomeContent({
  posts,
  sortBy,
  setSortBy,
  categories,
  recentComments,
  isLoading,
}: MinimalHomeContentProps) {
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])

  const minimalPosts = useMemo(() => posts.map(postToMinimalInput), [posts])

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="담벼락" />}
      sidebar={<MinimalSidebar sports={sports} life={life} />}
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
            전체
          </b>
        </div>
        <h1
          className="mt-1 text-[28px] leading-[1.15] font-extrabold"
          style={{ color: "var(--ms-ink)", letterSpacing: "-0.035em" }}
        >
          오늘 가장 뜨거운 글
        </h1>
      </div>

      {/* Sort chips */}
      <div className="mb-4 flex items-center gap-1.5">
        {SORT_OPTIONS.map((s) => {
          const isActive = sortBy === s.key
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSortBy(s.key)}
              aria-pressed={isActive}
              className={`h-8 rounded-full border px-4 text-[12px] font-semibold transition-colors ${
                isActive ? "text-white" : "hover:border-[var(--ms-line-hover)]"
              }`}
              style={{
                backgroundColor: isActive ? "var(--ms-ink)" : "var(--ms-surface)",
                borderColor: isActive ? "var(--ms-ink)" : "var(--ms-line)",
                color: isActive ? "#ffffff" : "var(--ms-ink-2)",
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Post list */}
      {isLoading && posts.length === 0 ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border"
              style={{
                backgroundColor: "var(--ms-surface)",
                borderColor: "var(--ms-line)",
              }}
            />
          ))}
        </div>
      ) : minimalPosts.length === 0 ? (
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
    </MinimalShell>
  )
}
