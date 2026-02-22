"use client"

import { useState, useEffect } from "react"
import { MessageSquare, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"
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

function mapApiPostsToRecentPosts(posts: { id: string; title: string; community_slug: string; comment_count?: number; latest_comment_at?: string; created_at: string }[]): RecentPost[] {
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
    comments: p.comment_count || 0,
    timestamp: formatRelativeTime(new Date(p.latest_comment_at || p.created_at)),
  }))
}

export function ActivitySidebar() {
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
        const response = await fetch('/api/posts?sort=recent_comments&limit=4')
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
    <div className="space-y-4 sticky top-16">

      {/* ===== 최근 댓글 섹션 ===== */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b border-border">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-[14px] font-bold text-foreground">최근 댓글</h3>
        </div>

        <div className="p-2">
          {isLoadingPosts ? (
            <div className="p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : recentPosts.length > 0 ? (
            recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/post/${post.id}`}
                className="block px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <p className="text-[13px] font-medium text-foreground line-clamp-1 mb-1.5">
                  {post.title}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] px-1.5 py-0.5 bg-secondary text-muted-foreground rounded font-medium">
                    {post.community}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="w-3 h-3" />
                      {post.comments}
                    </span>
                    <span>{post.timestamp}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">최근 댓글이 없습니다.</p>
            </div>
          )}
        </div>
      </Card>

    </div>
  )
}
