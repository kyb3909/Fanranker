"use client"

import { useState, useEffect, memo, Fragment } from "react"
import { MessageSquare, Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { AdPlaceholder } from "@/components/sidebar/ad-placeholder"
import { MonthlyPrizeBanner } from "@/components/sidebar/monthly-prize-banner"

import { useStickySidebar } from "@/hooks/use-sticky-sidebar"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

interface RecentPost {
  id: string
  title: string
  community: string
  comments: number
  // timestamp 는 raw ISO 로 보존 (필요 시 RelativeTime 컴포넌트로 client-mount 후 변환).
  // formatRelativeTime 을 SSR 시점에 호출하면 React #418 hydration mismatch 위험.
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
    last_comment_at?: string
    created_at: string
  }[]
): RecentPost[] {
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
    comments: p.comment_count || 0,
    timestamp: p.last_comment_at || p.created_at,
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
  // SSR prefetch 데이터로 useState lazy init → 첫 render 부터 댓글 포함된 HTML.
  // 이전엔 빈 배열로 시작 후 useEffect 에서 채우는 패턴 → hydration 후 sidebar 높이
  // 증가로 데스크톱 CLS 0.21+ 발생. lazy init 으로 SSR HTML 에 이미 댓글이 들어가
  // 시프트 제거.
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>(() => {
    if (initialRecentComments && initialRecentComments.length > 0) {
      return mapApiPostsToRecentPosts(
        initialRecentComments as Parameters<typeof mapApiPostsToRecentPosts>[0]
      )
    }
    return []
  })
  const [isLoadingPosts, setIsLoadingPosts] = useState(
    !(initialRecentComments && initialRecentComments.length > 0)
  )
  // 최근 댓글이 달린 글 가져오기 (서버 프리페치 데이터 우선 사용, 60초 캐시)
  useEffect(() => {
    // SSR prefetch 가 useState lazy init 으로 이미 채웠으면 client fetch 자체 skip.
    // cache 도 갱신해서 다른 ActivitySidebar 인스턴스에서 재사용 가능하게.
    if (initialRecentComments && initialRecentComments.length > 0) {
      if (recentPosts.length > 0 && !recentCommentsCache) {
        recentCommentsCache = { data: recentPosts, fetchedAt: Date.now() }
      }
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
    // recentPosts.length는 의도적으로 dep에서 제외 — setRecentPosts가 이 effect를 재실행시키는 무한 루프 방지.
    // 마운트 시 한 번 prefetch 데이터 체크 → 없으면 fetch 하는 패턴.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecentComments])

  return (
    <div ref={stickyRef} className="sticky space-y-4" style={{ top: `${stickyTop}px` }}>
      {/* ===== 이달의 상품 배너 (메인 페이지만) ===== */}
      {showPrize && <MonthlyPrizeBanner />}

      {/* ===== 최근 댓글 섹션 ===== */}
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          background: "var(--wc-card)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            background: "var(--wc-card)",
            borderBottom: "1px solid var(--wc-line)",
          }}
        >
          <MessageSquare className="h-3.5 w-3.5" style={{ color: "var(--wc-mute-2)" }} />
          <h3
            className="text-[11px] font-bold uppercase"
            style={{
              color: "var(--wc-ink)",
              letterSpacing: "0.18em",
            }}
          >
            최근 댓글 달린 게시물
          </h3>
        </div>

        <div className="py-1">
          {isLoadingPosts ? (
            <div className="p-4 text-center">
              <Loader2
                className="mx-auto h-5 w-5 animate-spin"
                style={{ color: "var(--wc-mute)" }}
              />
            </div>
          ) : recentPosts.length > 0 ? (
            recentPosts.map((post, idx) => (
              <Fragment key={post.id}>
                {idx > 0 && (
                  <div className="mx-4" style={{ borderTop: "1px solid var(--wc-line)" }} />
                )}
                <Link
                  href={`/post/${post.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 transition-colors"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--wc-soft)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <p
                      className="truncate text-[13px]"
                      style={{ color: "var(--wc-ink)", fontWeight: 500 }}
                    >
                      {post.title}
                    </p>
                    {post.comments > 0 && (
                      <span
                        className="shrink-0 text-[11px] font-semibold tabular-nums"
                        style={{ color: "var(--wc-mute)" }}
                      >
                        [{post.comments}]
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
                    {post.community}
                  </span>
                </Link>
              </Fragment>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs" style={{ color: "var(--wc-mute)" }}>
                최근 댓글이 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== 광고 플레이스홀더 ===== */}
      <AdPlaceholder variant="sidebar" />

      {/* 리그 순위표 일단 숨김 — 월드컵 이벤트 집중 (복원: StandingsWidget + IntersectionObserver 복구) */}
    </div>
  )
})

ActivitySidebar.displayName = "ActivitySidebar"
