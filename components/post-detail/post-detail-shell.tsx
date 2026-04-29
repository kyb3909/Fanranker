"use client"

import { useMemo, type ReactNode } from "react"
import useSWR from "swr"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { fetcher } from "@/lib/swr"
import { MinimalShell } from "@/components/minimal-sport/minimal-shell"
import { MinimalTopbar } from "@/components/minimal-sport/minimal-topbar"
import { MinimalSidebar } from "@/components/minimal-sport/minimal-sidebar"
import { MinimalRightAside } from "@/components/minimal-sport/minimal-right-aside"
import { MinimalPrizeCard } from "@/components/minimal-sport/minimal-prize-card"
import { MinimalTalkList, type TalkItem } from "@/components/minimal-sport/minimal-talk-list"

interface RawCategory {
  id: number | string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  parent_slug?: string | null
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

interface PostDetailShellProps {
  /** 활성 사이드바 카테고리 — 게시판 슬러그 (예: football) */
  activeSlug: string
  children: ReactNode
}

/**
 * Post Detail 페이지 Minimal Sport 셸 wrapper.
 *
 * - 좌 사이드바: 카테고리 (해당 게시판 active)
 * - 우 aside: PrizeCard + 최근 댓글 달린 게시물
 * - 메인 영역에 children(PostDetailContent) 렌더
 * - 상단 좌측 "← 뒤로" 버튼
 */
export function PostDetailShell({ activeSlug, children }: PostDetailShellProps) {
  const router = useRouter()

  const { data: catData } = useSWR<{ categories: RawCategory[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })
  const { data: talkData } = useSWR<{ posts: TalkItem[] }>(
    "/api/posts?sort=recent_comment&limit=10",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  )
  const categories = useMemo(() => catData?.categories ?? [], [catData])
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])
  const recentComments: TalkItem[] = useMemo(
    () =>
      (talkData?.posts ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        community_slug: t.community_slug,
        comment_count: t.comment_count,
      })),
    [talkData]
  )

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="담벼락" />}
      sidebar={<MinimalSidebar sports={sports} life={life} activeSlug={activeSlug} />}
      aside={
        <MinimalRightAside>
          <MinimalPrizeCard />
          <MinimalTalkList items={recentComments} />
        </MinimalRightAside>
      }
    >
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold transition-colors hover:opacity-70"
        style={{ color: "var(--ms-ink-3)" }}
      >
        <ArrowLeft className="h-4 w-4" />
        뒤로
      </button>
      {children}
    </MinimalShell>
  )
}
