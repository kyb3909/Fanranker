"use client"

import { useState, useMemo } from "react"
import dynamic from "next/dynamic"
import { PostCard } from "@/components/post-card"
import { Flame, Clock, MessageSquare, Trophy } from "lucide-react"

// BettingPage만 dynamic import (탭 전환 시에만 로드)
const BettingPage = dynamic(
  () => import("@/components/betting-page"),
  { 
    loading: () => <BettingPageSkeleton />,
    ssr: false
  }
)

function BettingPageSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
      <div className="h-6 bg-muted rounded w-1/3 mb-4" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded" />
        ))}
      </div>
    </div>
  )
}

type SortType = "hot" | "new" | "comments"
type TabType = "community" | "betting"

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
  temperature?: number
  isUpvoted: boolean
  createdAt: Date
}

interface HomeFeedProps {
  initialPosts: Post[]
}

export function HomeFeed({ initialPosts }: HomeFeedProps) {
  const [activeTab, setActiveTab] = useState<TabType>("community")
  const [sortBy, setSortBy] = useState<SortType>("hot")

  // useMemo로 정렬 결과 캐싱
  const sortedPosts = useMemo(() => {
    return [...initialPosts].sort((a, b) => {
      switch (sortBy) {
        case "hot":
          return (b.temperature ?? 0) - (a.temperature ?? 0)
        case "new":
          return b.createdAt.getTime() - a.createdAt.getTime()
        case "comments":
          return b.comments - a.comments
        default:
          return 0
      }
    })
  }, [initialPosts, sortBy])

  return (
    <div className="col-span-12 lg:col-span-6 space-y-4">
      {/* ===== 탭 네비게이션 (포털 스타일) ===== */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex border-b border-border" role="tablist">
          <button
            onClick={() => setActiveTab("community")}
            role="tab"
            aria-selected={activeTab === "community"}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] min-h-[48px] ${
              activeTab === "community"
                ? "border-primary text-foreground bg-primary/10"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            커뮤니티
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
              activeTab === "community" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>
              {initialPosts.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("betting")}
            role="tab"
            aria-selected={activeTab === "betting"}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] min-h-[48px] ${
              activeTab === "betting"
                ? "border-primary text-foreground bg-primary/10"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Trophy className="w-4 h-4" aria-hidden="true" />
            승부 예측
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
              activeTab === "betting" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>
              12
            </span>
          </button>
        </div>
        
        {/* 서브 네비게이션: 정렬 옵션 */}
        {activeTab === "community" && (
          <div className="flex items-center justify-center px-4 py-3 bg-muted/30" role="group" aria-label="게시물 정렬">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy("hot")}
                aria-pressed={sortBy === "hot"}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all min-h-[44px] ${
                  sortBy === "hot"
                    ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
              >
                <Flame className="w-4 h-4" aria-hidden="true" />
                온도순
              </button>
              <button
                onClick={() => setSortBy("new")}
                aria-pressed={sortBy === "new"}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all min-h-[44px] ${
                  sortBy === "new"
                    ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
              >
                <Clock className="w-4 h-4" aria-hidden="true" />
                최신순
              </button>
              <button
                onClick={() => setSortBy("comments")}
                aria-pressed={sortBy === "comments"}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all min-h-[44px] ${
                  sortBy === "comments"
                    ? "bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                댓글순
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === "community" && (
        <div className="space-y-3">
          {sortedPosts.length > 0 ? (
            sortedPosts.map((post, index) => (
              <PostCard key={post.id} post={post} priority={index === 0} />
            ))
          ) : (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                팔로우한 게시판의 게시물이 없습니다.
              </p>
              <p className="text-xs text-muted-foreground">
                게시판을 팔로우하면 여기에 게시물이 표시됩니다.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "betting" && (
        <BettingPage />
      )}
    </div>
  )
}
