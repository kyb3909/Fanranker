"use client"

import useSWR, { SWRConfig } from "swr"
import { ActivitySidebar } from "@/components/activity-sidebar"
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
}

interface RawPost {
  id: string
  title: string
  community_slug: string
  comment_count?: number
  view_count?: number
  vote_count?: number
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
  }))
}

const swrOptions = { revalidateOnFocus: false, dedupingInterval: 5000 } as const

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
  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    ...swrOptions,
    dedupingInterval: 30000,
  })
  const { data: popularData, isLoading: popularLoading } = useSWR<{ posts: RawPost[] }>(
    "/api/posts?sort=hot&limit=10",
    fetcher,
    swrOptions
  )
  const { data: recommendedData, isLoading: recommendedLoading } = useSWR<{ posts: RawPost[] }>(
    "/api/posts?sort=votes&limit=5",
    fetcher,
    swrOptions
  )
  const { data: commentedData, isLoading: commentedLoading } = useSWR<{ posts: RawPost[] }>(
    "/api/posts?sort=comments&limit=5",
    fetcher,
    swrOptions
  )
  const { data: viewedData, isLoading: viewedLoading } = useSWR<{ posts: RawPost[] }>(
    "/api/posts?sort=views&limit=5",
    fetcher,
    swrOptions
  )

  const categories = catData?.categories || []
  const popularPosts = mapPosts(popularData?.posts || [])
  const topRecommended = mapPosts(recommendedData?.posts || [])
  const topCommented = mapPosts(commentedData?.posts || [])
  const topViewed = mapPosts(viewedData?.posts || [])

  const isPopularLoading = popularLoading && !popularData
  const isRecommendedLoading = recommendedLoading && !recommendedData
  const isCommentedLoading = commentedLoading && !commentedData
  const isViewedLoading = viewedLoading && !viewedData

  return (
    <main id="main-content" className="container mx-auto max-w-[1280px] px-4 py-6" tabIndex={-1}>
      <div className="grid grid-cols-12 gap-6">
        {/* Main Content */}
        <div className="col-span-12 space-y-6 xl:col-span-9">
          {/* 게시판 둘러보기 */}
          {categories.length > 0 && (
            <div className="border-border overflow-hidden rounded-xl border">
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

          {/* 실시간 인기글 게시판 */}
          <div className="bg-card border-border rounded-lg border">
            <div className="border-border flex items-center justify-between border-b p-4">
              <h2 className="text-primary text-lg font-bold">실시간 인기글</h2>
            </div>

            <div className="divide-border divide-y">
              {isPopularLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="text-muted-foreground mx-auto mb-2 h-6 w-6 animate-spin" />
                  <p className="text-muted-foreground text-sm">글 목록을 불러오는 중...</p>
                </div>
              ) : popularPosts.length > 0 ? (
                popularPosts.map((post) => (
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
                    <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                      <span className="text-xs font-medium text-orange-500">[{post.comments}]</span>
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Eye className="h-3 w-3" />
                        {post.views}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">아직 게시물이 없습니다.</p>
                </div>
              )}
            </div>
          </div>

          {/* 오늘의 최다 추천글, 댓글, 조회수 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Most Recommended */}
            <div className="bg-card border-border rounded-lg border p-4">
              <h3 className="text-foreground mb-3 flex items-center gap-1 text-sm font-bold">
                <ThumbsUp className="h-3.5 w-3.5" />
                최다 추천
              </h3>
              <div className="space-y-2">
                {isRecommendedLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="text-muted-foreground mx-auto h-4 w-4 animate-spin" />
                  </div>
                ) : topRecommended.length > 0 ? (
                  topRecommended.map((post, index) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="hover:bg-secondary/50 block rounded p-2 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs font-bold">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground mb-1 line-clamp-2 text-xs">{post.title}</p>
                          <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />[{post.comments}]
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {post.views}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-muted-foreground py-2 text-center text-xs">게시물 없음</p>
                )}
              </div>
            </div>

            {/* Most Commented */}
            <div className="bg-card border-border rounded-lg border p-4">
              <h3 className="text-foreground mb-3 flex items-center gap-1 text-sm font-bold">
                <MessageSquare className="h-3.5 w-3.5" />
                최다 댓글
              </h3>
              <div className="space-y-2">
                {isCommentedLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="text-muted-foreground mx-auto h-4 w-4 animate-spin" />
                  </div>
                ) : topCommented.length > 0 ? (
                  topCommented.map((post, index) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="hover:bg-secondary/50 block rounded p-2 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs font-bold">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground mb-1 line-clamp-2 text-xs">{post.title}</p>
                          <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />[{post.comments}]
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {post.views}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-muted-foreground py-2 text-center text-xs">게시물 없음</p>
                )}
              </div>
            </div>

            {/* Most Viewed */}
            <div className="bg-card border-border rounded-lg border p-4">
              <h3 className="text-foreground mb-3 flex items-center gap-1 text-sm font-bold">
                <Eye className="h-3.5 w-3.5" />
                최다 조회
              </h3>
              <div className="space-y-2">
                {isViewedLoading ? (
                  <div className="p-4 text-center">
                    <Loader2 className="text-muted-foreground mx-auto h-4 w-4 animate-spin" />
                  </div>
                ) : topViewed.length > 0 ? (
                  topViewed.map((post, index) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="hover:bg-secondary/50 block rounded p-2 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 text-xs font-bold">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground mb-1 line-clamp-2 text-xs">{post.title}</p>
                          <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />[{post.comments}]
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {post.views}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-muted-foreground py-2 text-center text-xs">게시물 없음</p>
                )}
              </div>
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
