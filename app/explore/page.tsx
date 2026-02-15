"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/header"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { Eye, MessageSquare, Loader2, ThumbsUp } from "lucide-react"
import Link from "next/link"

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

// 커뮤니티 이름 매핑
const COMMUNITY_NAMES: Record<string, string> = {
  "overseas-football": "해외축구",
  "domestic-football": "국내축구",
  "baseball": "야구",
  "basketball": "농구",
  "volleyball": "배구",
  "esports": "e스포츠",
  "free-board": "자유게시판",
  "tips": "정보게시판",
}

export default function ExplorePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [popularPosts, setPopularPosts] = useState<Post[]>([])
  const [topRecommended, setTopRecommended] = useState<Post[]>([])
  const [topCommented, setTopCommented] = useState<Post[]>([])
  const [topViewed, setTopViewed] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const mapPosts = (posts: any[]) => (posts || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
      communitySlug: p.community_slug,
      comments: p.comment_count || 0,
      views: p.view_count || 0,
      upvotes: p.vote_count || 0,
    }))

    async function fetchPosts() {
      setIsLoading(true)
      try {
        // 병렬 fetch로 성능 개선
        const [categoriesRes, popularRes, recommendedRes, commentedRes, viewedRes] = await Promise.all([
          fetch('/api/categories'),
          fetch('/api/posts?sort=hot&limit=10'),
          fetch('/api/posts?sort=hot&limit=3'),
          fetch('/api/posts?sort=comments&limit=3'),
          fetch('/api/posts?sort=new&limit=3'),
        ])

        if (categoriesRes.ok) {
          const { categories: cats } = await categoriesRes.json()
          setCategories(cats || [])
        }
        if (popularRes.ok) {
          const { posts } = await popularRes.json()
          setPopularPosts(mapPosts(posts))
        }
        if (recommendedRes.ok) {
          const { posts } = await recommendedRes.json()
          setTopRecommended(mapPosts(posts))
        }
        if (commentedRes.ok) {
          const { posts } = await commentedRes.json()
          setTopCommented(mapPosts(posts))
        }
        if (viewedRes.ok) {
          const { posts } = await viewedRes.json()
          setTopViewed(mapPosts(posts))
        }
      } catch (error) {
        console.error('Failed to fetch posts:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="container mx-auto px-4 py-6 max-w-[1280px]" tabIndex={-1}>
        <div className="grid grid-cols-12 gap-6">
          {/* Main Content */}
          <div className="col-span-12 xl:col-span-9 space-y-6">
            {/* 게시판 둘러보기 */}
            {categories.length > 0 && (
              <div className="bg-card border border-border rounded-lg">
                <div className="p-4 border-b border-border">
                  <h2 className="font-bold text-lg text-primary">게시판 둘러보기</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                  {categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={`/community/${cat.slug}`}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-colors text-center"
                    >
                      <span className="text-2xl">{cat.icon || '📋'}</span>
                      <span className="text-xs font-semibold text-foreground">{cat.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 실시간 인기글 게시판 */}
            <div className="bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-bold text-lg text-primary">실시간 인기글</h2>
              </div>

              <div className="divide-y divide-border">
                {isLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">글 목록을 불러오는 중...</p>
                  </div>
                ) : popularPosts.length > 0 ? (
                  popularPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{post.title}</p>
                        <span className="text-xs text-muted-foreground mt-1 block">{post.community}</span>
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <span className="text-xs text-orange-500 font-medium">[{post.comments}]</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          {post.views}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm text-muted-foreground">아직 게시물이 없습니다.</p>
                  </div>
                )}
              </div>
            </div>

            {/* 오늘의 최다 추천글, 댓글, 조회수 */}
            <div className="grid grid-cols-3 gap-4">
              {/* Most Recommended */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-bold text-sm mb-3 text-foreground flex items-center gap-1">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  오늘의 추천글
                </h3>
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : topRecommended.length > 0 ? (
                    topRecommended.map((post, index) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.id}`}
                        className="block hover:bg-secondary/50 p-2 rounded transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-primary mt-0.5">{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground line-clamp-2 mb-1">{post.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground text-center py-2">게시물 없음</p>
                  )}
                </div>
              </div>

              {/* Most Commented */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-bold text-sm mb-3 text-foreground flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  오늘의 댓글
                </h3>
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : topCommented.length > 0 ? (
                    topCommented.map((post, index) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.id}`}
                        className="block hover:bg-secondary/50 p-2 rounded transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-primary mt-0.5">{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground line-clamp-2 mb-1">{post.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground text-center py-2">게시물 없음</p>
                  )}
                </div>
              </div>

              {/* Most Viewed */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-bold text-sm mb-3 text-foreground flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  최신 글
                </h3>
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : topViewed.length > 0 ? (
                    topViewed.map((post, index) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.id}`}
                        className="block hover:bg-secondary/50 p-2 rounded transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-primary mt-0.5">{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground line-clamp-2 mb-1">{post.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground text-center py-2">게시물 없음</p>
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
    </div>
  )
}
