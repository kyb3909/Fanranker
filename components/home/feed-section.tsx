"use client"

import React, { memo } from "react"
import { PostCard } from "@/components/post-card"
import { AdPlaceholder } from "@/components/sidebar/ad-placeholder"
import { Loader2, Compass } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import type { Post } from "@/hooks/use-feed"

interface FeedSectionProps {
  posts: Post[]
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
}

export const FeedSection = memo(function FeedSection({
  posts,
  isLoading,
  isLoadingMore,
  loadMore,
}: FeedSectionProps) {
  const { isSignedIn } = useAuth()
  const loadMoreRef = useInfiniteScroll(loadMore)

  if (isLoading) {
    return (
      <>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-card border-border animate-pulse rounded-xl border px-4 py-3 sm:px-5"
            style={{ minHeight: 220 }}
          >
            {/* Header skeleton */}
            <div className="mb-3 flex items-center gap-3">
              <div className="bg-muted h-8 w-8 rounded-full" />
              <div className="flex-1">
                <div className="bg-muted mb-1.5 h-3.5 w-24 rounded" />
                <div className="bg-muted h-3 w-16 rounded" />
              </div>
            </div>
            {/* Title */}
            <div className="bg-muted mb-2.5 h-5 w-3/4 rounded" />
            {/* Body text (2 lines) */}
            <div className="bg-muted mb-1.5 h-3.5 w-full rounded" />
            <div className="bg-muted mb-4 h-3.5 w-2/3 rounded" />
            {/* Image placeholder (aspect-video) */}
            {i <= 2 && <div className="bg-muted mb-4 aspect-[16/9] w-full rounded-lg" />}
            {/* Footer */}
            <div className="border-border flex items-center gap-4 border-t pt-3">
              <div className="bg-muted h-3 w-12 rounded" />
              <div className="bg-muted h-3 w-12 rounded" />
              <div className="bg-muted ml-auto h-3 w-16 rounded" />
            </div>
          </div>
        ))}
      </>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="bg-card border-border rounded-lg border p-8 text-center">
        <Compass className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
        <p className="text-foreground mb-2 text-sm font-medium">
          {isSignedIn
            ? "관심 있는 게시판을 팔로우해보세요!"
            : "로그인하고 게시판을 팔로우해보세요!"}
        </p>
        <p className="text-muted-foreground mb-4 text-xs">
          {isSignedIn
            ? "팔로우한 게시판의 글이 담벼락에 표시됩니다."
            : "팔로우한 게시판의 최신 글을 모아볼 수 있어요."}
        </p>
        <Link
          href="/explore"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Compass className="h-4 w-4" />
          게시판 탐색하기
        </Link>
      </div>
    )
  }

  return (
    <>
      {posts.map((post, index) => (
        <React.Fragment key={post.id}>
          <PostCard post={post} />
          {(index + 1) % 5 === 0 && <AdPlaceholder variant="banner" />}
        </React.Fragment>
      ))}
      {/* 무한 스크롤 센티널 */}
      <div ref={loadMoreRef} className="py-4 text-center">
        {isLoadingMore && (
          <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
        )}
      </div>
    </>
  )
})

FeedSection.displayName = "FeedSection"
