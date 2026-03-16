"use client"

import { useState, useMemo } from "react"
import useSWR, { SWRConfig } from "swr"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { Eye, MessageSquare, Loader2, ThumbsUp, LayoutGrid } from "lucide-react"
import Link from "next/link"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { fetcher } from "@/lib/swr"

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
}

export function ExploreContent({ fallback }: ExploreContentProps) {
  return (
    <SWRConfig value={{ fallback }}>
      <ExploreInner />
    </SWRConfig>
  )
}

function ExploreInner() {
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

  // 24시간 이내 + 추천 10개 이상 필터
  const hotPosts = useMemo(() => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    return allPosts.filter((p) => p.upvotes >= 10 && p.createdAt >= oneDayAgo)
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

  const SORT_TABS: { key: SortTab; label: string; icon: typeof ThumbsUp }[] = [
    { key: "upvotes", label: "추천순", icon: ThumbsUp },
    { key: "comments", label: "댓글순", icon: MessageSquare },
    { key: "views", label: "조회순", icon: Eye },
  ]

  return (
    <main id="main-content" className="container mx-auto max-w-[1280px] px-4 py-6" tabIndex={-1}>
      <div className="grid grid-cols-12 gap-6">
        {/* Main Content */}
        <div className="col-span-12 space-y-6 xl:col-span-9">
          {/* 게시판 둘러보기 */}
          {categories.length > 0 && (
            <div className="bg-card border-border overflow-hidden rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="flex items-center gap-2 px-4 py-3">
                <LayoutGrid className="text-primary h-3.5 w-3.5" />
                <h2 className="text-primary text-[14px] font-bold">게시판 둘러보기</h2>
              </div>
              <div className="divide-border grid grid-cols-5 gap-0 divide-x">
                {categories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/community/${cat.slug}`}
                    className="hover:bg-muted/40 flex flex-col items-center gap-1.5 py-4 text-center transition-colors"
                  >
                    <span className="text-2xl">{cat.icon || "📋"}</span>
                    <span className="text-foreground text-[13px] font-semibold">{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 실시간 인기글 */}
          <div className="bg-card border-border rounded-lg border">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-primary text-lg font-bold">실시간 인기글</h2>
              <span className="text-muted-foreground text-xs">추천 10+ · 최근 24시간</span>
            </div>

            {/* 정렬 탭 */}
            <div className="border-border flex border-b">
              {SORT_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSortTab(key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                    sortTab === key
                      ? "text-primary border-primary border-b-2 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="divide-border divide-y">
              {isContentLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="text-muted-foreground mx-auto mb-2 h-6 w-6 animate-spin" />
                  <p className="text-muted-foreground text-sm">글 목록을 불러오는 중...</p>
                </div>
              ) : sortedPosts.length > 0 ? (
                sortedPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className="hover:bg-secondary/30 flex items-center justify-between p-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm">{post.title}</p>
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {post.community}
                      </span>
                    </div>
                    <div className="ml-4 flex flex-shrink-0 items-center gap-3 text-xs">
                      <span className="text-primary flex items-center gap-1 font-medium">
                        <ThumbsUp className="h-3 w-3" />
                        {post.upvotes}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {post.comments}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {post.views}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    최근 24시간 내 추천 10개 이상 게시물이 없습니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="col-span-3 hidden xl:block">
          <ActivitySidebar />
        </aside>
      </div>
    </main>
  )
}
