"use client"

import React, { memo } from "react"
import { PostCard } from "@/components/post-card"
import { AdPlaceholder } from "@/components/sidebar/ad-placeholder"
import { Loader2, Compass } from "lucide-react"
import Link from "@/components/ui/app-link"
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
            className="animate-pulse rounded-lg px-4 py-3 sm:px-5"
            style={{
              minHeight: 220,
              background: "var(--wc-card)",
              boxShadow: "var(--wc-shadow-1)",
            }}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full" style={{ background: "var(--wc-soft)" }} />
              <div className="flex-1">
                <div
                  className="mb-1.5 h-3.5 w-24 rounded"
                  style={{ background: "var(--wc-soft)" }}
                />
                <div className="h-3 w-16 rounded" style={{ background: "var(--wc-soft)" }} />
              </div>
            </div>
            <div className="mb-2.5 h-5 w-3/4 rounded" style={{ background: "var(--wc-soft)" }} />
            <div className="mb-1.5 h-3.5 w-full rounded" style={{ background: "var(--wc-soft)" }} />
            <div className="mb-4 h-3.5 w-2/3 rounded" style={{ background: "var(--wc-soft)" }} />
            {i <= 2 && (
              <div
                className="mb-4 aspect-[16/9] w-full rounded-lg"
                style={{ background: "var(--wc-soft)" }}
              />
            )}
            <div
              className="flex items-center gap-4 pt-3"
              style={{ borderTop: "1px solid var(--wc-line)" }}
            >
              <div className="h-3 w-12 rounded" style={{ background: "var(--wc-soft)" }} />
              <div className="h-3 w-12 rounded" style={{ background: "var(--wc-soft)" }} />
              <div className="ml-auto h-3 w-16 rounded" style={{ background: "var(--wc-soft)" }} />
            </div>
          </div>
        ))}
      </>
    )
  }

  if (posts.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center"
        style={{
          background: "var(--wc-card)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <Compass className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--wc-mute)" }} />
        <p className="mb-2 text-sm font-bold" style={{ color: "var(--wc-ink)" }}>
          {isSignedIn
            ? "관심 있는 게시판을 팔로우해보세요!"
            : "로그인하고 게시판을 팔로우해보세요!"}
        </p>
        <p className="mb-4 text-xs" style={{ color: "var(--wc-mute)" }}>
          {isSignedIn
            ? "팔로우한 게시판의 글이 담벼락에 표시됩니다."
            : "팔로우한 게시판의 최신 글을 모아볼 수 있어요."}
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
          style={{
            background: "var(--wc-burgundy)",
            color: "white",
          }}
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
          {/* content-visibility: auto — 뷰포트 밖 카드의 렌더링을 브라우저가 스킵 */}
          {/* 첫 3개(above-the-fold)는 즉시 렌더, 나머지는 지연 */}
          <div
            style={
              index >= 3
                ? { contentVisibility: "auto", containIntrinsicSize: "auto 400px" }
                : undefined
            }
          >
            {/* LCP 후보가 첫 카드가 아닐 수 있음(첫 카드에 이미지 없으면 2번째가 LCP). 상위 2개에 priority. */}
            <PostCard post={post} priority={index < 2} />
          </div>
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
