"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/header"
import { PostCard } from "@/components/post-card"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { Dices, Flame, Clock, Loader2, Compass } from "lucide-react"
import Link from "next/link"

type SortType = "random" | "hot" | "new"

interface Post {
  id: string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | any
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  createdAt: Date
}

// 상대적 시간 포맷팅
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
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

export default function Home() {
  const [sortBy, setSortBy] = useState<SortType>("hot")
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [followedCommunities] = useState<Set<string>>(
    new Set(["overseas-football", "baseball", "free-board"]) // 기본 팔로우 커뮤니티 (예시)
  )

  // Supabase에서 글 목록 가져오기
  useEffect(() => {
    async function fetchPosts() {
      setIsLoading(true)
      try {
        const sortParam = sortBy === "hot" ? "hot" : sortBy === "random" ? "new" : "new"
        const response = await fetch(`/api/posts?sort=${sortParam}&limit=50`)
        
        if (!response.ok) {
          throw new Error('글 목록을 가져오는데 실패했습니다.')
        }

        const { posts: fetchedPosts, profiles } = await response.json()

        // 프로필 매핑
        const profileMap = new Map<string, any>(profiles?.map((p: any) => [p.user_id, p]) || [])

        // 데이터 변환
        const transformedPosts: Post[] = fetchedPosts
          .filter((post: any) => followedCommunities.has(post.community_slug)) // 팔로우한 커뮤니티만
          .map((post: any) => {
            const profile = profileMap.get(post.user_id)
            return {
              id: post.id,
              community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
              communitySlug: post.community_slug,
              author: profile?.nickname || "익명",
              avatar: profile?.avatar_url || "/placeholder-user.jpg",
              userId: post.user_id, // Clerk user_id 추가
              timestamp: formatRelativeTime(new Date(post.created_at)),
              title: post.title,
              content: post.content, // TipTap JSON
              image: post.image,
              upvotes: post.vote_count || 0,
              comments: post.comment_count || 0,
              isUpvoted: false,
              createdAt: new Date(post.created_at),
            }
          })

        setPosts(transformedPosts)
      } catch (error) {
        console.error('Failed to fetch posts:', error)
        // 에러 발생 시 빈 배열로 설정
        setPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [sortBy, followedCommunities])

  // 정렬 (API에서 이미 정렬되어 오지만, 클라이언트에서도 재정렬 가능)
  const sortedPosts = [...posts].sort((a, b) => {
    switch (sortBy) {
      case "random":
        // 랜덤 정렬 (매번 다른 순서)
        return Math.random() - 0.5
      case "hot":
        // 온도순 (upvotes 기반, API에서는 temperature 사용)
        return b.upvotes - a.upvotes
      case "new":
        return b.createdAt.getTime() - a.createdAt.getTime()
      default:
        return 0
    }
  })

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* 메인 컨테이너: Threads 스타일 중앙 정렬 */}
      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        {/* 12컬럼 그리드: Threads 스타일 간격 */}
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar - 3 columns */}
          <aside className="hidden lg:block col-span-3">
            <CommunitySidebar />
          </aside>

          {/* Main Content - 6 columns */}
          <div className="col-span-12 lg:col-span-6 space-y-4">

            {/* ===== 정렬 네비게이션 ===== */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-center px-4 py-3 bg-muted/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => setSortBy("random")}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[15px] font-semibold transition-all whitespace-nowrap ${
                      sortBy === "random"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Dices className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    랜덤
                  </button>
                  <button
                    onClick={() => setSortBy("hot")}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[15px] font-semibold transition-all whitespace-nowrap ${
                      sortBy === "hot"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Flame className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    온도순
                  </button>
                  <button
                    onClick={() => setSortBy("new")}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-[15px] font-semibold transition-all whitespace-nowrap ${
                      sortBy === "new"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    최신순
                  </button>
                </div>
              </div>
            </div>

            {/* 포스트 리스트 */}
            <div className="space-y-3">
              {isLoading ? (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">글 목록을 불러오는 중...</p>
                </div>
              ) : sortedPosts.length > 0 ? (
                sortedPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))
              ) : (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    팔로우한 게시판의 게시물이 없습니다.
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    게시판을 팔로우하면 여기에 게시물이 표시됩니다.
                  </p>
                  <Link
                    href="/explore"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Compass className="w-4 h-4" />
                    게시판 탐색하기
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - 3 columns */}
          <aside className="hidden lg:block col-span-3">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}
