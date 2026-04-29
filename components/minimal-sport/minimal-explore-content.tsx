"use client"

import { useState, useMemo } from "react"
import { Eye, MessageSquare, ThumbsUp, Loader2 } from "lucide-react"
import { MinimalShell } from "./minimal-shell"
import { MinimalTopbar } from "./minimal-topbar"
import { MinimalSidebar } from "./minimal-sidebar"
import { MinimalRightAside } from "./minimal-right-aside"
import { MinimalCategoryGrid, type MinimalCategoryGridItem } from "./minimal-category-grid"
import { MinimalPostListItem, type MinimalPostListItemData } from "./minimal-post-list-item"
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

interface MinimalExploreContentProps {
  categories: RawCategory[]
  /** 추천 1+ · 최근 7일 필터된 게시글 (이미 정렬된 set 또는 raw — sort tab은 클라에서) */
  posts: MinimalPostListItemData[]
  recentComments: TalkItem[]
  isLoading?: boolean
}

type SortTab = "upvotes" | "comments" | "views"

const SORT_TABS: { key: SortTab; label: string; Icon: typeof ThumbsUp }[] = [
  { key: "upvotes", label: "추천순", Icon: ThumbsUp },
  { key: "comments", label: "댓글순", Icon: MessageSquare },
  { key: "views", label: "조회순", Icon: Eye },
]

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

/**
 * 운동장(/explore) 메인 — Minimal Sport 디자인.
 *
 * 데스크톱(lg+) 전용. 모바일/태블릿은 부모 ExploreContent에서 기존 디자인 유지.
 * 담벼락/예측과 동일 셸/Topbar/Sidebar/RightAside 사용 → 통일성.
 */
export function MinimalExploreContent({
  categories,
  posts,
  recentComments,
  isLoading,
}: MinimalExploreContentProps) {
  const [sortTab, setSortTab] = useState<SortTab>("upvotes")
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])
  const gridCategories: MinimalCategoryGridItem[] = useMemo(
    () =>
      categories
        .filter((c) => !c.parent_slug)
        .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon })),
    [categories]
  )

  const sortedPosts = useMemo(() => {
    const list = [...posts]
    switch (sortTab) {
      case "upvotes":
        return list.sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0))
      case "comments":
        return list.sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0))
      case "views":
        return list.sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    }
  }, [posts, sortTab])

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="운동장" />}
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
          운동장 ·{" "}
          <b className="font-semibold" style={{ color: "var(--ms-ink-2)" }}>
            트렌딩
          </b>
        </div>
        <h1
          className="mt-1 text-[28px] leading-[1.15] font-extrabold"
          style={{ color: "var(--ms-ink)", letterSpacing: "-0.035em" }}
        >
          지금 뜨고 있는 글
        </h1>
      </div>

      {/* 카테고리 그리드 */}
      <div className="mb-5">
        <MinimalCategoryGrid categories={gridCategories} cols={5} />
      </div>

      {/* 실시간 인기글 카드 */}
      <section
        className="overflow-hidden rounded-2xl border bg-[var(--ms-surface)]"
        style={{ borderColor: "var(--ms-line)" }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ borderColor: "var(--ms-line)" }}
        >
          <h2 className="text-[14px] font-extrabold" style={{ color: "var(--ms-ink)" }}>
            실시간 인기글
          </h2>
          <span className="text-[11px] font-medium" style={{ color: "var(--ms-ink-3)" }}>
            추천 1+ · 최근 7일
          </span>
        </header>

        {/* Sort tabs */}
        <div className="flex border-b" style={{ borderColor: "var(--ms-line)" }} role="tablist">
          {SORT_TABS.map(({ key, label, Icon }) => {
            const isActive = sortTab === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSortTab(key)}
                className="relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] transition-colors"
                style={{
                  color: isActive ? "var(--ms-ink)" : "var(--ms-ink-3)",
                  fontWeight: isActive ? 800 : 600,
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute right-3 -bottom-px left-3 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--ms-brand)" }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Post list */}
        <div className="divide-y" style={{ borderColor: "var(--ms-line)" }}>
          {isLoading ? (
            <div className="px-5 py-10 text-center">
              <Loader2
                className="mx-auto mb-2 h-5 w-5 animate-spin"
                style={{ color: "var(--ms-ink-3)" }}
              />
              <p className="text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
                글 목록을 불러오는 중...
              </p>
            </div>
          ) : sortedPosts.length === 0 ? (
            <div
              className="px-5 py-10 text-center text-[13px]"
              style={{ color: "var(--ms-ink-3)" }}
            >
              최근 7일 내 추천받은 게시물이 없습니다.
            </div>
          ) : (
            sortedPosts.map((p) => (
              <div
                key={p.id}
                style={{ borderColor: "var(--ms-line)" }}
                className="border-b last:border-b-0"
              >
                <MinimalPostListItem post={p} />
              </div>
            ))
          )}
        </div>
      </section>
    </MinimalShell>
  )
}
