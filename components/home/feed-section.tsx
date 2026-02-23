"use client"

import React, { memo } from "react"
import { PostCard } from "@/components/post-card"
import { AdPlaceholder } from "@/components/ad-placeholder"
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

export const FeedSection = memo(function FeedSection({ posts, isLoading, isLoadingMore, loadMore }: FeedSectionProps) {
  const { isSignedIn } = useAuth()
  const loadMoreRef = useInfiniteScroll(loadMore)

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">글 목록을 불러오는 중...</p>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <Compass className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-foreground font-medium mb-2">
          {isSignedIn
            ? "관심 있는 게시판을 팔로우해보세요!"
            : "로그인하고 게시판을 팔로우해보세요!"}
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          {isSignedIn
            ? "팔로우한 게시판의 글이 피드에 표시됩니다."
            : "팔로우한 게시판의 최신 글을 모아볼 수 있어요."}
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Compass className="w-4 h-4" />
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
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        )}
      </div>
    </>
  )
})

FeedSection.displayName = "FeedSection"
