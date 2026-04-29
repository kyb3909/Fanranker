"use client"

import { useState, useMemo } from "react"
import useSWR, { SWRConfig } from "swr"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { fetcher } from "@/lib/swr"
import { MinimalExploreContent } from "@/components/minimal-sport/minimal-explore-content"
import type { TalkItem } from "@/components/minimal-sport/minimal-talk-list"

interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
}

interface Post {
  id: string
  title: string
  community: string
  communitySlug: string
  comments: number
  views: number
  upvotes: number
  createdAt: string
}

interface RawPost {
  id: string
  title: string
  community_slug: string
  comment_count?: number
  view_count?: number
  vote_count?: number
  created_at: string
}

function mapPosts(posts: RawPost[]): Post[] {
  return (posts || []).map((p) => ({
    id: p.id,
    title: p.title,
    community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
    communitySlug: p.community_slug,
    comments: p.comment_count || 0,
    views: p.view_count || 0,
    upvotes: p.vote_count || 0,
    createdAt: p.created_at,
  }))
}

const swrOptions = { revalidateOnFocus: false, dedupingInterval: 5000 } as const

type SortTab = "upvotes" | "comments" | "views"

interface ExploreContentProps {
  fallback: Record<string, unknown>
  recentComments?: Array<{
    id: string
    title: string
    community_slug: string | null
    comment_count: number | null
  }>
}

export function ExploreContent({ fallback, recentComments }: ExploreContentProps) {
  return (
    <SWRConfig value={{ fallback }}>
      <ExploreInner recentComments={recentComments} />
    </SWRConfig>
  )
}

interface ExploreInnerProps {
  recentComments?: Array<{
    id: string
    title: string
    community_slug: string | null
    comment_count: number | null
  }>
}

function ExploreInner({ recentComments }: ExploreInnerProps) {
  const [sortTab, setSortTab] = useState<SortTab>("upvotes")

  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    ...swrOptions,
    dedupingInterval: 30000,
  })

  // 최근 글 50개를 가져와서 클라이언트에서 추천 10+ 필터
  const { data: postsData, isLoading } = useSWR<{ posts: RawPost[] }>(
    "/api/posts?sort=new&limit=50",
    fetcher,
    swrOptions
  )

  const categories = catData?.categories || []
  const allPosts = mapPosts(postsData?.posts || [])

  // 7일 이내 + 추천 1개 이상 필터
  const hotPosts = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    return allPosts.filter((p) => p.upvotes >= 1 && p.createdAt >= sevenDaysAgo)
  }, [allPosts])

  // 정렬
  const sortedPosts = useMemo(() => {
    const sorted = [...hotPosts]
    switch (sortTab) {
      case "upvotes":
        return sorted.sort((a, b) => b.upvotes - a.upvotes)
      case "comments":
        return sorted.sort((a, b) => b.comments - a.comments)
      case "views":
        return sorted.sort((a, b) => b.views - a.views)
    }
  }, [hotPosts, sortTab])

  const isContentLoading = isLoading && !postsData

  // Minimal Sport용 데이터 어댑터 — 동일 SWR 데이터를 새 디자인이 그대로 사용
  const minimalCategories = (catData?.categories ?? []) as Array<{
    id: number | string
    slug: string
    name: string
    icon: string | null
    sort_order: number
    parent_slug?: string | null
  }>
  const minimalPosts = sortedPosts.map((p) => ({
    id: p.id,
    title: p.title,
    community_slug: p.communitySlug,
    upvotes: p.upvotes,
    comments: p.comments,
    views: p.views,
  }))
  const minimalTalk: TalkItem[] = (recentComments ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    community_slug: t.community_slug,
    comment_count: t.comment_count,
  }))

  return (
    <MinimalExploreContent
      categories={minimalCategories}
      posts={minimalPosts}
      recentComments={minimalTalk}
      isLoading={isContentLoading}
    />
  )
}
