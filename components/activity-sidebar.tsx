"use client"

import { useState, useEffect, memo, Fragment } from "react"
import { MessageSquare, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import { AdPlaceholder } from "@/components/ad-placeholder"
import { MonthlyPrizeBanner } from "@/components/monthly-prize-banner"
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
}: {
  showPrize?: boolean
}) {
  const { ref: stickyRef, stickyTop } = useStickySidebar()
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)

  // 최근 댓글이 달린 글 가져오기 (60초 캐시 사용)
  useEffect(() => {
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
  }, [])

  return (
    <div ref={stickyRef} className="sticky space-y-4" style={{ top: `${stickyTop}px` }}>
      {/* ===== 이달의 상품 배너 (메인 페이지만) ===== */}
      {showPrize && <MonthlyPrizeBanner />}

      {/* ===== 최근 댓글 섹션 ===== */}
      <Card className="border-border relative gap-0 overflow-hidden rounded-xl border py-0 shadow-none">
        <div className="via-primary/60 absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-transparent to-transparent" />
        <div className="flex items-center gap-2 px-4 py-3">
          <MessageSquare className="text-primary h-3.5 w-3.5" />
          <h3 className="text-primary text-[14px] font-bold">최근 댓글 달린 게시물</h3>
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
                  prefetch={false}
                  className="hover:bg-muted/40 flex items-center gap-2 px-4 py-2.5 transition-colors"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <p className="text-foreground truncate text-[14px] font-medium">{post.title}</p>
                    {post.comments > 0 && (
                      <span className="text-primary shrink-0 text-[12px] font-semibold">
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
    </div>
  )
})

ActivitySidebar.displayName = "ActivitySidebar"
