"use client"

import { useState, useEffect, useRef, memo } from "react"
import { Users, Pencil, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import Link from "@/components/ui/app-link"
import { useAuth } from "@clerk/nextjs"
import { toast } from "@/hooks/use-toast"

interface Flair {
  id: string
  name: string
  color: string
}

interface Post {
  id: number | string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: unknown // TipTap JSON or string
  image?: string
  upvotes: number
  comments: number
  temperature?: number
  views?: number
  rating?: number
  isUpvoted: boolean
  userId?: string
  createdAt: Date
  isNotice?: boolean
  flair?: Flair | null
  titleDisplay?: {
    adjTitle?: string | null
    nounTitle?: string | null
    rarity?: string | null
  } | null
}

interface Community {
  name: string
  description: string
  members: string
  banner: string
}

interface CommunityContentProps {
  community: Community
  posts: Post[]
  isMainContent?: boolean
  communitySlug?: string
  currentPage?: number
  totalPages?: number
  totalCount?: number
  flairs?: Flair[]
  activeFlairId?: string
}

export const CommunityContent = memo(function CommunityContent({
  community,
  posts,
  isMainContent = false,
  communitySlug,
  currentPage = 1,
  totalPages = 1,
  totalCount = 0,
  flairs = [],
  activeFlairId,
}: CommunityContentProps) {
  const { isSignedIn } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  // flair 가로 스크롤 ref + 화살표 핸들러
  const flairScrollRef = useRef<HTMLDivElement>(null)
  const scrollFlairs = (dir: "left" | "right") => {
    const el = flairScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" })
  }

  // 팔로우 상태 확인
  useEffect(() => {
    if (!isSignedIn || !communitySlug) return
    fetch(`/api/community/${communitySlug}/follow`)
      .then((res) => (res.ok ? res.json() : { following: false }))
      .then((data) => setIsFollowing(data.following))
      .catch(() => {})
  }, [isSignedIn, communitySlug])

  const handleFollow = async () => {
    if (!isSignedIn) {
      toast({ variant: "destructive", title: "로그인 필요", description: "로그인이 필요합니다." })
      return
    }
    if (!communitySlug || isFollowLoading) return
    setIsFollowLoading(true)
    try {
      const method = isFollowing ? "DELETE" : "POST"
      const res = await fetch(`/api/community/${communitySlug}/follow`, { method })
      if (res.ok) {
        const data = await res.json()
        setIsFollowing(data.following)
      }
    } catch {
      // silent fail
    } finally {
      setIsFollowLoading(false)
    }
  }

  // 항상 최신순 정렬 (공지는 서버에서 이미 상단 배치)
  const sortedPosts = [...posts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  if (!isMainContent) {
    return (
      <>
        {/* 커뮤니티 콘텐츠: 컴팩트한 간격 */}
        <div className="py-4">
          {/* 커뮤니티 헤더 — wc eyebrow + 큰 헤딩 + 멤버 메타 */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="wc-sec-eb">COMMUNITY</div>
              <h1
                className="font-black tracking-tight"
                style={{
                  fontSize: "clamp(22px, 3.5vw, 28px)",
                  lineHeight: 1.15,
                  color: "var(--wc-ink)",
                  letterSpacing: "-0.02em",
                }}
              >
                {community.name}
              </h1>
              {community.description && (
                <p
                  className="mt-1.5 text-[14px] leading-relaxed"
                  style={{ color: "var(--wc-mute)" }}
                >
                  {community.description}
                </p>
              )}
              <div
                className="mt-2 flex items-center gap-3 text-[12px]"
                style={{ color: "var(--wc-mute)" }}
              >
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-semibold tabular-nums">{community.members}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFollow}
              disabled={isFollowLoading}
              className="shrink-0 rounded-md px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-60"
              style={{
                background: isFollowing ? "var(--wc-card)" : "var(--wc-burgundy)",
                color: isFollowing ? "var(--wc-mute)" : "white",
                border: isFollowing ? "1px solid var(--wc-line-2)" : "1px solid var(--wc-burgundy)",
                minHeight: 36,
              }}
            >
              {isFollowing ? "팔로잉" : "팔로우"}
            </button>
          </div>

          <div
            className="overflow-hidden rounded-lg"
            style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
          >
            {/* 테이블 상단: 말머리 필터 + 글쓰기 — wc-soft strip */}
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{
                background: "var(--wc-soft)",
                borderBottom: "1px solid var(--wc-line)",
              }}
            >
              {/* 말머리 필터 — 가로 스크롤 (flair 많을 때 정리). flair 없으면 빈 공간 */}
              <div className="relative min-w-0 flex-1">
                {flairs.length > 0 && (
                  <>
                    {/* 좌 스크롤 버튼 (sm 이상 — 모바일은 swipe) */}
                    <button
                      type="button"
                      onClick={() => scrollFlairs("left")}
                      aria-label="이전 말머리"
                      className="absolute top-1/2 left-0 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors sm:flex"
                      style={{
                        background: "var(--wc-card, #ffffff)",
                        color: "var(--wc-burgundy, #a0203b)",
                        boxShadow: "0 1px 4px rgba(26,20,22,0.12)",
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div
                      ref={flairScrollRef}
                      className="scrollbar-none flex items-center gap-1 overflow-x-auto py-0.5 sm:px-9"
                    >
                      <Link
                        href={`/community/${communitySlug}`}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap transition-colors sm:min-h-0"
                        style={{
                          background: !activeFlairId ? "var(--wc-burgundy)" : "var(--wc-card)",
                          color: !activeFlairId ? "white" : "var(--wc-mute)",
                          border: !activeFlairId
                            ? "1px solid var(--wc-burgundy)"
                            : "1px solid var(--wc-line-2)",
                        }}
                      >
                        전체
                      </Link>
                      {flairs.map((f) => (
                        <Link
                          key={f.id}
                          href={`/community/${communitySlug}?flair=${f.id}`}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap transition-colors hover:opacity-90 sm:min-h-0"
                          style={{
                            backgroundColor: activeFlairId === f.id ? f.color : `${f.color}15`,
                            color: activeFlairId === f.id ? "white" : f.color,
                            border:
                              activeFlairId === f.id
                                ? `1px solid ${f.color}`
                                : "1px solid var(--wc-line-2)",
                          }}
                        >
                          {f.name}
                        </Link>
                      ))}
                    </div>

                    {/* 우 스크롤 버튼 (sm 이상) */}
                    <button
                      type="button"
                      onClick={() => scrollFlairs("right")}
                      aria-label="다음 말머리"
                      className="absolute top-1/2 right-0 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors sm:flex"
                      style={{
                        background: "var(--wc-card, #ffffff)",
                        color: "var(--wc-burgundy, #a0203b)",
                        boxShadow: "0 1px 4px rgba(26,20,22,0.12)",
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              {communitySlug && (
                <Link
                  href={`/write?community=${communitySlug}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-bold transition-colors"
                  style={{
                    background: "var(--wc-burgundy)",
                    color: "white",
                    minHeight: 36,
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  글쓰기
                </Link>
              )}
            </div>

            {/* 테이블 헤더 — wc-soft tone, uppercase eyebrow letter-spacing */}
            <div
              className="hidden grid-cols-10 gap-2 px-3 py-2.5 text-[11px] font-bold sm:grid"
              style={{
                background: "var(--wc-soft)",
                color: "var(--wc-mute)",
                borderBottom: "1px solid var(--wc-line)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <div className="col-span-1 text-center">번호</div>
              <div className="col-span-5">제목</div>
              <div className="col-span-2 text-center">글쓴이</div>
              <div className="col-span-1 text-center">날짜</div>
              <div className="col-span-1 text-center">추천</div>
            </div>
            {/* 모바일 헤더 */}
            <div
              className="grid grid-cols-12 gap-1 px-3 py-2.5 text-[11px] font-bold sm:hidden"
              style={{
                background: "var(--wc-soft)",
                color: "var(--wc-mute)",
                borderBottom: "1px solid var(--wc-line)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <div className="col-span-8">제목</div>
              <div className="col-span-4 text-right">글쓴이</div>
            </div>

            {/* 테이블 바디: 조밀한 행 간격 */}
            {sortedPosts.length > 0 ? (
              sortedPosts.map((post, index) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="block gap-2 px-3 py-2.5 text-xs transition-colors last:border-0 sm:grid sm:grid-cols-10"
                  style={{
                    borderBottom: "1px solid var(--wc-line)",
                    background: post.isNotice ? "var(--wc-soft)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!post.isNotice) e.currentTarget.style.background = "var(--wc-soft)"
                  }}
                  onMouseLeave={(e) => {
                    if (!post.isNotice) e.currentTarget.style.background = "transparent"
                  }}
                >
                  {/* 데스크탑 레이아웃 */}
                  <div
                    className="col-span-1 hidden text-center tabular-nums sm:block"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    {post.isNotice ? (
                      <span className="font-bold" style={{ color: "var(--wc-burgundy)" }}>
                        공지
                      </span>
                    ) : (
                      totalCount - (currentPage - 1) * 25 - index
                    )}
                  </div>
                  <div className="col-span-5 hidden items-center gap-1.5 sm:flex">
                    {post.flair && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: `${post.flair.color}20`,
                          color: post.flair.color,
                        }}
                      >
                        {post.flair.name}
                      </span>
                    )}
                    <span className="truncate font-semibold" style={{ color: "var(--wc-ink)" }}>
                      {post.title}
                    </span>
                    {post.comments > 0 && (
                      <span
                        className="flex-shrink-0 font-bold tabular-nums"
                        style={{ color: "var(--wc-warn)" }}
                      >
                        [{post.comments}]
                      </span>
                    )}
                  </div>
                  <div
                    className="col-span-2 hidden truncate text-center sm:block"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    {post.author}
                  </div>
                  <div
                    className="col-span-1 hidden text-center sm:block"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    {post.timestamp}
                  </div>
                  <div
                    className="col-span-1 hidden text-center tabular-nums sm:block"
                    style={{ color: "var(--wc-ink)", fontWeight: 600 }}
                  >
                    {post.upvotes}
                  </div>
                  {/* 모바일 레이아웃 */}
                  <div className="grid grid-cols-12 items-center gap-1 sm:hidden">
                    <div className="col-span-8 flex min-w-0 items-center gap-1.5">
                      {post.isNotice && (
                        <span
                          className="shrink-0 font-bold"
                          style={{ color: "var(--wc-burgundy)" }}
                        >
                          [공지]
                        </span>
                      )}
                      {!post.isNotice && post.flair && (
                        <span
                          className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold"
                          style={{
                            backgroundColor: `${post.flair.color}20`,
                            color: post.flair.color,
                          }}
                        >
                          {post.flair.name}
                        </span>
                      )}
                      <span className="truncate font-semibold" style={{ color: "var(--wc-ink)" }}>
                        {post.title}
                      </span>
                      {post.comments > 0 && (
                        <span
                          className="shrink-0 font-bold tabular-nums"
                          style={{ color: "var(--wc-warn)" }}
                        >
                          [{post.comments}]
                        </span>
                      )}
                    </div>
                    <div
                      className="col-span-4 truncate text-right"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      {post.author}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-8 text-center" style={{ color: "var(--wc-mute)" }}>
                <p className="text-sm">아직 게시물이 없습니다.</p>
              </div>
            )}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="mt-4">
              <PostPagination
                communitySlug={communitySlug!}
                currentPage={currentPage}
                totalPages={totalPages}
                activeFlairId={activeFlairId}
              />
            </div>
          )}
        </div>
      </>
    )
  }

  return null
})

function PostPagination({
  communitySlug,
  currentPage,
  totalPages,
  activeFlairId,
}: {
  communitySlug: string
  currentPage: number
  totalPages: number
  activeFlairId?: string
}) {
  const pageUrl = (page: number) => {
    const params = new URLSearchParams()
    if (page > 1) params.set("page", String(page))
    if (activeFlairId) params.set("flair", activeFlairId)
    const qs = params.toString()
    return `/community/${communitySlug}${qs ? `?${qs}` : ""}`
  }

  // 표시할 페이지 번호 계산 (현재 페이지 주변 2개씩)
  const pages: (number | "ellipsis")[] = []
  const delta = 2

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    const start = Math.max(2, currentPage - delta)
    const end = Math.min(totalPages - 1, currentPage + delta)
    if (start > 2) pages.push("ellipsis")
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages - 1) pages.push("ellipsis")
    pages.push(totalPages)
  }

  return (
    <Pagination>
      <PaginationContent>
        {currentPage > 1 && (
          <PaginationItem>
            <PaginationPrevious href={pageUrl(currentPage - 1)} />
          </PaginationItem>
        )}
        {pages.map((page, i) =>
          page === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink href={pageUrl(page)} isActive={page === currentPage}>
                {page}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        {currentPage < totalPages && (
          <PaginationItem>
            <PaginationNext href={pageUrl(currentPage + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  )
}

CommunityContent.displayName = "CommunityContent"
