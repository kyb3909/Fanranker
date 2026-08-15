"use client"

import React, { memo } from "react"
import { PostCard } from "@/components/post-card"
import { extractFirstEmbedFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { AdPlaceholder } from "@/components/sidebar/ad-placeholder"
import { Loader2, Compass } from "lucide-react"
import Link from "@/components/ui/app-link"
import { useAuth } from "@clerk/nextjs"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import type { Post } from "@/hooks/use-feed"
import { useBlockedUsers } from "@/hooks/use-blocked-users"

interface FeedSectionProps {
  posts: Post[]
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  /**
   * 게시물 껍데기 — PostCard 로 그대로 넘긴다. 기본 `card` = 프로덕션 현재 모습.
   * `row` 는 홈 리디자인 프리뷰(/home-preview)에서만 쓴다 (2026-08-15).
   */
  variant?: "card" | "row"
}

export const FeedSection = memo(function FeedSection({
  posts,
  isLoading,
  isLoadingMore,
  loadMore,
  variant = "card",
}: FeedSectionProps) {
  const { isSignedIn } = useAuth()
  const { isBlocked } = useBlockedUsers()
  const loadMoreRef = useInfiniteScroll(loadMore)

  // 차단한 유저의 글은 피드에서 숨김 (댓글 섹션과 동일한 클라이언트 필터)
  const visiblePosts = posts.filter((p) => !p.userId || !isBlocked(p.userId))

  // Instagram 임베드는 embed.js 가 iframe 을 동적으로 self-resize → content-visibility:auto 의
  // size containment 와 충돌해 스크롤 시 임베드가 collapse/사라짐. 해당 카드만 content-visibility 제외.
  const igEmbedIds = React.useMemo(() => {
    const ids = new Set<Post["id"]>()
    for (const p of posts) {
      if (
        typeof p.content === "object" &&
        extractFirstEmbedFromTipTapJSON(p.content)?.attrs.provider === "instagram"
      ) {
        ids.add(p.id)
      }
    }
    return ids
  }, [posts])

  // posts 가 비었을 때만 스켈레톤. 로그인 콜드 로드는 useFeed 가 SSR initialData 를 반환하므로
  // posts 가 차 있어 스켈레톤 대신 실제 피드를 그린다(footer off-screen 유지 → CLS 방지).
  if (isLoading && visiblePosts.length === 0) {
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
            ? "관심 게시판을 팔로우해보세요!"
            : "로그인하고 관심 게시판을 팔로우해보세요!"}
        </p>
        <p className="mb-4 text-xs" style={{ color: "var(--wc-mute)" }}>
          {isSignedIn
            ? "팔로우한 게시판의 글이 내 담벼락에 표시돼요."
            : "팔로우한 게시판의 최신 글을 담벼락에서 모아볼 수 있어요."}
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

  // ⚠️ card(프로덕션) 는 **반드시 Fragment 로 반환**한다. 호출부가 `space-y-2.5` 로
  //    게시물 간격을 주는데(`> * + *`), 래퍼 div 를 하나 끼우면 포스트가 직계 자식이
  //    아니게 돼 간격이 통째로 사라진다. row 일 때만 구분선용 래퍼를 씌운다.
  const items = (
    <>
      {visiblePosts.map((post, index) => (
        <React.Fragment key={post.id}>
          {/* content-visibility: auto — 뷰포트 밖 카드의 렌더링을 브라우저가 스킵 */}
          {/* 첫 3개(above-the-fold)는 즉시 렌더, 나머지는 지연 */}
          <div
            style={
              index >= 3 && !igEmbedIds.has(post.id)
                ? { contentVisibility: "auto", containIntrinsicSize: "auto 400px" }
                : undefined
            }
          >
            {/* LCP 후보가 첫 카드가 아닐 수 있음(텍스트/iframe 카드가 앞서면 3번째가 LCP). 상위 3개에 priority. */}
            <PostCard post={post} priority={index < 3} variant={variant} />
          </div>
          {(index + 1) % 7 === 0 && <AdPlaceholder variant="banner" />}
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

  return variant === "row" ? <div className="gnp-rows">{items}</div> : items
})

FeedSection.displayName = "FeedSection"
