"use client"

import { useMemo } from "react"
import { useEffect, useState } from "react"
import useSWR from "swr"
import dynamic from "next/dynamic"
import { fetcher } from "@/lib/swr"
import { MinimalShell } from "./minimal-shell"
import { MinimalTopbar } from "./minimal-topbar"
import { MinimalSidebar } from "./minimal-sidebar"
import { MinimalRightAside } from "./minimal-right-aside"
import { MinimalPrizeCard } from "./minimal-prize-card"
import { MinimalTalkList, type TalkItem } from "./minimal-talk-list"

const ShopPage = dynamic(() => import("@/components/shop/shop-page"), {
  loading: () => (
    <div className="animate-pulse space-y-4">
      <div className="h-40 rounded-2xl" style={{ backgroundColor: "var(--ms-bg-hover)" }} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl"
            style={{ backgroundColor: "var(--ms-bg-hover)" }}
          />
        ))}
      </div>
    </div>
  ),
})

interface RawCategory {
  id: number | string
  slug: string
  name: string
  icon?: string | null
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

/**
 * 상점(/shop) 메인 — Minimal Sport 디자인.
 *
 * 데스크톱(lg+) 전용. 모바일/태블릿은 부모 page.tsx에서 기존 ShopPage 그대로.
 * 1차 wiring: 셸만 통일(Topbar/Sidebar/RightAside) + 메인 영역은 기존
 * ShopPage 컴포넌트(스티커/칭호/픽셀아트) 그대로 dynamic import — 기능 100% 유지.
 */
export function MinimalShopContent() {
  // sidebar 카테고리 + recentComments 클라이언트 SWR (server prefetch 미적용 페이지)
  const { data: catData } = useSWR<{ categories: RawCategory[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })
  const { data: talkData } = useSWR<{
    posts: {
      id: string
      title: string
      community_slug: string | null
      comment_count: number | null
    }[]
  }>("/api/posts?sort=recent_comment&limit=10", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const categories = catData?.categories ?? []
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])
  const talkItems: TalkItem[] = (talkData?.posts ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    community_slug: t.community_slug,
    comment_count: t.comment_count,
  }))

  // SWR fallback이 없는 ShopPage 자체를 wrap. 한 번만 mount되도록 deferred.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="상점" />}
      sidebar={<MinimalSidebar sports={sports} life={life} />}
      aside={
        <MinimalRightAside>
          <MinimalPrizeCard />
          <MinimalTalkList items={talkItems} />
        </MinimalRightAside>
      }
    >
      {mounted && <ShopPage />}
    </MinimalShell>
  )
}
