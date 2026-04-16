"use client"

import { useState, useEffect, useRef, memo, Fragment } from "react"
import dynamic from "next/dynamic"
import { MessageSquare, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "@/components/ui/app-link"
import { AdPlaceholder } from "@/components/sidebar/ad-placeholder"
import { MonthlyPrizeBanner } from "@/components/sidebar/monthly-prize-banner"

const StandingsWidget = dynamic(
  () =>
    import("@/components/sidebar/standings-widget").then((m) => ({ default: m.StandingsWidget })),
  {
    ssr: false,
    loading: () => <div className="bg-card border-border h-64 animate-pulse rounded-lg border" />,
  }
)
import { useStickySidebar } from "@/hooks/use-sticky-sidebar"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"

interface RecentPost {
  id: string
  title: string
  community: string
  comments: number
  timestamp: string
}

// 최근 댓글 API 응답 캐시 (60초) — 새로고침/탭 전환 시 API·DB 부하 감소
const RECENT_COMMENTS_CACHE_MS = 60 * 1000
let recentCommentsCache: { data: RecentPost[]; fetchedAt: number } | null = null

function mapApiPostsToRecentPosts(
  posts: {
    id: string
    title: string
    community_slug: string
    comment_count?: number
    latest_comment_at?: string
    created_at: string
  }[]
): RecentPost[] {
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
    comments: p.comment_count || 0,
    timestamp: formatRelativeTime(new Date(p.latest_comment_at || p.created_at)),
  }))
}

export const ActivitySidebar = memo(function ActivitySidebar({
  showPrize = false,
  initialRecentComments,
}: {
  showPrize?: boolean
  initialRecentComments?: unknown[]
}) {
  const { ref: stickyRef, stickyTop } = useStickySidebar()
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [standingsVisible, setStandingsVisible] = useState(false)
  const standingsRef = useRef<HTMLDivElement>(null)

  // 순위표 위젯: 뷰포트에 들어올 때만 로드 (초기 로드 부하 감소)
  useEffect(() => {
    const el = standingsRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStandingsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 최근 댓글이 달린 글 가져오기 (서버 프리페치 데이터 우선 사용, 60초 캐시)
  useEffect(() => {
    // 서버에서 받은 초기 데이터가 있으면 바로 사용
    if (initialRecentComments && initialRecentComments.length > 0 && recentPosts.length === 0) {
      const mapped = mapApiPostsToRecentPosts(
        initialRecentComments as Parameters<typeof mapApiPostsToRecentPosts>[0]
      )
      setRecentPosts(mapped)
      recentCommentsCache = { data: mapped, fetchedAt: Date.now() }
      setIsLoadingPosts(false)
      return
    }

    async function fetchRecentPosts() {
      const now = Date.now()
      if (recentCommentsCache && now - recentCommentsCache.fetchedAt < RECENT_COMMENTS_CACHE_MS) {
        setRecentPosts(recentCommentsCache.data)
        setIsLoadingPosts(false)
        return
      }
      setIsLoadingPosts(true)
      try {
        const response = await fetch("/api/posts?sort=recent_comments&limit=10")
        if (response.ok) {
          const { posts } = await response.json()
          const mapped = mapApiPostsToRecentPosts(posts || [])
          setRecentPosts(mapped)
          recentCommentsCache = { data: mapped, fetchedAt: Date.now() }
        }
      } catch {
        // Silent fail - sidebar content is non-critical
      } finally {
        setIsLoadingPosts(false)
      }
    }

    fetchRecentPosts()
  }, [initialRecentComments])

  return (
    <div ref={stickyRef} className="sticky space-y-4" style={{ top: `${stickyTop}px` }}>
      {/* ===== 이달의 상품 배너 (메인 페이지만) ===== */}
      {showPrize && <MonthlyPrizeBanner />}

      {/* ===== 최근 댓글 섹션 ===== */}
      <Card className="border-border relative gap-0 overflow-hidden rounded-lg border py-0">
        <div className="flex items-center gap-2 px-4 py-3">
          <MessageSquare className="text-primary h-3.5 w-3.5" />
          <h3 className="text-primary text-[13px] font-semibold">최근 댓글 달린 게시물</h3>
        </div>

        <div className="py-1">
          {isLoadingPosts ? (
            <div className="p-4 text-center">
              <Loader2 className="text-muted-foreground mx-auto h-5 w-5 animate-spin" />
            </div>
          ) : recentPosts.length > 0 ? (
            recentPosts.map((post, idx) => (
              <Fragment key={post.id}>
                {idx > 0 && <div className="mx-4 border-t" />}
                <Link
                  href={`/post/${post.id}`}
                  className="hover:bg-muted/40 flex items-center gap-2 px-4 py-2.5 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <p className="text-foreground truncate text-[13px] font-medium">{post.title}</p>
                    {post.comments > 0 && (
                      <span className="text-primary shrink-0 text-[11px] font-medium">
                        [{post.comments}]
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[12px]">
                    {post.community}
                  </span>
                </Link>
              </Fragment>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-muted-foreground text-xs">최근 댓글이 없습니다.</p>
            </div>
          )}
        </div>
      </Card>

      {/* ===== 광고 플레이스홀더 ===== */}
      <AdPlaceholder variant="sidebar" />

      {/* ===== 리그 순위표 위젯 (뷰포트 진입 시 로드) ===== */}
      <div ref={standingsRef}>
        {standingsVisible ? (
          <StandingsWidget />
        ) : (
          <div className="bg-card border-border h-64 animate-pulse rounded-lg border" />
        )}
      </div>
    </div>
  )
})

ActivitySidebar.displayName = "ActivitySidebar"
