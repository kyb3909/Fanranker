import { Suspense } from "react"
import { Header } from "@/components/header"
import { HomeFeed } from "@/components/home-feed"
import { CommunitySidebar } from "@/components/community-sidebar"
import { ActivitySidebar } from "@/components/activity-sidebar"
import { createServerAnonClient } from "@/lib/supabase"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { computeTemperature } from "@/lib/temperature"

// 스켈레톤 컴포넌트 (Suspense fallback)
function SidebarSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/2 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-6 h-6 bg-muted rounded" />
            <div className="h-3 bg-muted rounded flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
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

// 팔로우한 커뮤니티 slug 조회 (로그인 시)
async function getFollowedCommunitySlugs(): Promise<Set<string>> {
  try {
    const user = await currentUser()
    if (!user?.id) return new Set()

    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from("community_follows")
      .select("community_slug")
      .eq("user_id", user.id)

    return new Set((data ?? []).map((r) => r.community_slug))
  } catch {
    return new Set()
  }
}

// 서버에서 게시글 가져오기
// 로그인: 팔로우한 커뮤니티만 / 비로그인: 전체 게시판 취합
async function fetchPosts(followedSlugs: Set<string>) {
  try {
    const supabase = createServerAnonClient()
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from("posts")
      .select(`
        id,
        user_id,
        community_slug,
        title,
        content,
        image,
        vote_count,
        comment_count,
        created_at
      `)
      .is("deleted_at", null)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(50)

    if (followedSlugs.size > 0) {
      query = query.in("community_slug", [...followedSlugs])
    }

    const { data: posts, error } = await query

    if (error) {
      console.error("Failed to fetch posts:", error)
      return []
    }

    if (!posts || posts.length === 0) return []

    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in("user_id", userIds)

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

    return posts
      .map((post) => {
        const profile = profileMap.get(post.user_id)
        const row = {
          vote_count: post.vote_count || 0,
          comment_count: post.comment_count || 0,
          created_at: post.created_at,
        }
        return {
          id: post.id,
          community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
          communitySlug: post.community_slug,
          author: profile?.nickname || "익명",
          avatar: profile?.avatar_url || "/placeholder-user.jpg",
          userId: post.user_id,
          timestamp: formatRelativeTime(new Date(post.created_at)),
          title: post.title,
          content: post.content,
          image: post.image,
          upvotes: post.vote_count || 0,
          comments: post.comment_count || 0,
          temperature: computeTemperature(row),
          isUpvoted: false,
          createdAt: new Date(post.created_at),
        }
      })
  } catch (error) {
    console.error("Error in fetchPosts:", error)
    return []
  }
}

export default async function Home() {
  const followedSlugs = await getFollowedCommunitySlugs()
  const initialPosts = await fetchPosts(followedSlugs)

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* 메인 컨테이너: Threads 스타일 중앙 정렬 */}
      <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]" tabIndex={-1}>
        {/* 12컬럼 그리드: Threads 스타일 간격 */}
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar - 3 columns */}
          <aside className="hidden lg:block col-span-3">
            <Suspense fallback={<SidebarSkeleton />}>
              <CommunitySidebar />
            </Suspense>
          </aside>

          {/* Main Content - 6 columns */}
          <HomeFeed initialPosts={initialPosts} />

          {/* Right Sidebar - 3 columns */}
          <aside className="hidden lg:block col-span-3">
            <Suspense fallback={<SidebarSkeleton />}>
              <ActivitySidebar />
            </Suspense>
          </aside>
        </div>
      </main>
    </div>
  )
}
