"use client"

import { useRef, memo } from "react"
import { Pencil, Megaphone, ChevronLeft, ChevronRight } from "lucide-react"
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
import { useBlockedUsers } from "@/hooks/use-blocked-users"
import { useCanPostNotice } from "@/hooks/use-board-moderator"

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
  hideFollowHeader?: boolean
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
  const { isBlocked } = useBlockedUsers()
  const canPostNotice = useCanPostNotice(communitySlug)

  // flair 가로 스크롤 ref + 화살표 핸들러
  const flairScrollRef = useRef<HTMLDivElement>(null)
  const scrollFlairs = (dir: "left" | "right") => {
    const el = flairScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" })
  }

  // 차단한 유저의 글은 목록에서 숨김 (피드/댓글과 동일 클라 필터)
  // 항상 최신순 정렬 (공지는 서버에서 이미 상단 배치)
  const sortedPosts = [...posts]
    .filter((p) => !p.userId || !isBlocked(p.userId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  if (!isMainContent) {
    return (
      <>
        {/* 커뮤니티 콘텐츠: 컴팩트한 간격 */}
        <div className="py-4">
          {/* 팔로우 기능 비활성 — 기자 도입 후 복원 예정 (미니헤더 팔로우 버튼 제거) */}

          <div
            className="overflow-hidden rounded-lg"
            style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
          >
            {/* 테이블 상단: 말머리 필터 + 글쓰기 — wc-soft strip */}
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{
                background: "#ffffff",
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
                        color: "var(--wc-burgundy, #961E37)",
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
                        className="inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap transition-colors"
                        style={{
                          height: 34,
                          padding: "0 14px",
                          fontSize: 13,
                          fontWeight: 700,
                          background: !activeFlairId ? "var(--wc-ink)" : "var(--wc-card)",
                          color: !activeFlairId ? "white" : "var(--wc-mute)",
                          border: !activeFlairId
                            ? "1px solid var(--wc-ink)"
                            : "1px solid var(--wc-line-2)",
                        }}
                      >
                        전체
                      </Link>
                      {flairs.map((f) => (
                        <Link
                          key={f.id}
                          href={`/community/${communitySlug}?flair=${f.id}`}
                          className="inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap transition-colors hover:opacity-90"
                          style={{
                            height: 34,
                            padding: "0 14px",
                            fontSize: 13,
                            fontWeight: 700,
                            backgroundColor: activeFlairId === f.id ? "var(--wc-ink)" : "#ffffff",
                            color: activeFlairId === f.id ? "#ffffff" : "var(--wc-mute)",
                            border:
                              activeFlairId === f.id
                                ? "1px solid var(--wc-ink)"
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
                        color: "var(--wc-burgundy, #961E37)",
                        boxShadow: "0 1px 4px rgba(26,20,22,0.12)",
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              {communitySlug && canPostNotice && (
                <Link
                  href={`/write?community=${communitySlug}&notice=1`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-bold transition-colors"
                  style={{
                    borderColor: "var(--wc-burgundy)",
                    color: "var(--wc-burgundy)",
                    background: "var(--wc-card)",
                    minHeight: 36,
                  }}
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  공지 작성
                </Link>
              )}
              {communitySlug && (
                // 모바일은 우하단 글쓰기 FAB(floating-write-button)가 있어 중복 → 줄 안 버튼은 데스크톱만.
                // 모바일에서 이 버튼을 숨겨야 말머리 칩이 전체 너비를 써서 글쓰기 버튼에 가려지지 않음.
                <Link
                  href={`/write?community=${communitySlug}`}
                  className="hidden shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-bold transition-colors sm:inline-flex"
                  style={{
                    background: "var(--wc-card)",
                    color: "var(--wc-mute)",
                    border: "1px solid var(--wc-line-2)",
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
                background: "#ffffff",
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
                background: "#ffffff",
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
                    background: post.isNotice ? "rgba(246,228,232,0.5)" : "transparent",
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
                          backgroundColor: "#ffffff",
                          color: "var(--wc-mute)",
                          border: "1px solid var(--wc-line-2)",
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
                            backgroundColor: "#ffffff",
                            color: "var(--wc-mute)",
                            border: "1px solid var(--wc-line-2)",
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
              <PaginationLink
                href={pageUrl(page)}
                isActive={page === currentPage}
                className={
                  page === currentPage
                    ? "!border-[var(--wc-burgundy)] !bg-[var(--wc-burgundy)] !text-white"
                    : "!border-[var(--wc-line-2)] !bg-white"
                }
              >
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
