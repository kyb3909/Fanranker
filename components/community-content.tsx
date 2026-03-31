"use client"

import { useState, useEffect, memo } from "react"
import { Users, Pencil } from "lucide-react"
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
          {/* 커뮤니티 헤더: 간격 축소 */}
          <div className="mb-4 flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-foreground text-2xl font-bold">{community.name}</h1>
              <p className="text-muted-foreground text-sm">{community.description}</p>
              <div className="text-muted-foreground flex items-center gap-3 pt-1 text-xs">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{community.members}</span>
                </div>
              </div>
            </div>
            <Button
              variant={isFollowing ? "outline" : "default"}
              size="sm"
              className="h-8 px-4 text-sm font-medium"
              onClick={handleFollow}
              disabled={isFollowLoading}
            >
              {isFollowing ? "팔로잉" : "팔로우"}
            </Button>
          </div>

          <div className="bg-card border-border overflow-hidden rounded-lg border">
            {/* 테이블 상단: 말머리 필터 + 글쓰기 */}
            <div className="border-border bg-muted/50 flex items-center justify-between gap-2 border-b px-3 py-2">
              {/* 말머리 필터 */}
              <div className="flex flex-wrap items-center gap-1">
                {flairs.length > 0 && (
                  <>
                    <Link
                      href={`/community/${communitySlug}`}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        !activeFlairId
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      전체
                    </Link>
                    {flairs.map((f) => (
                      <Link
                        key={f.id}
                        href={`/community/${communitySlug}?flair=${f.id}`}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          activeFlairId === f.id
                            ? "text-white"
                            : "text-muted-foreground hover:opacity-80"
                        }`}
                        style={{
                          backgroundColor: activeFlairId === f.id ? f.color : undefined,
                          ...(activeFlairId !== f.id && {
                            backgroundColor: `${f.color}15`,
                            color: f.color,
                          }),
                        }}
                      >
                        {f.name}
                      </Link>
                    ))}
                  </>
                )}
              </div>
              {communitySlug && (
                <Link href={`/write?community=${communitySlug}`} className="shrink-0">
                  <Button size="sm" className="h-7 gap-1.5 px-3 text-xs">
                    <Pencil className="h-3.5 w-3.5" />
                    글쓰기
                  </Button>
                </Link>
              )}
            </div>

            {/* 테이블 헤더: 컴팩트한 패딩 */}
            <div className="border-border bg-muted/30 text-muted-foreground hidden grid-cols-10 gap-2 border-b px-3 py-2 text-xs font-medium sm:grid">
              <div className="col-span-1 text-center">번호</div>
              <div className="col-span-5">제목</div>
              <div className="col-span-2 text-center">글쓴이</div>
              <div className="col-span-1 text-center">날짜</div>
              <div className="col-span-1 text-center">추천</div>
            </div>
            {/* 모바일 헤더 */}
            <div className="border-border bg-muted/30 text-muted-foreground grid grid-cols-12 gap-1 border-b px-3 py-2 text-xs font-medium sm:hidden">
              <div className="col-span-8">제목</div>
              <div className="col-span-4 text-right">글쓴이</div>
            </div>

            {/* 테이블 바디: 조밀한 행 간격 */}
            {sortedPosts.length > 0 ? (
              sortedPosts.map((post, index) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="border-border/50 hover:bg-muted/50 block gap-2 border-b px-3 py-2 text-xs transition-colors last:border-0 sm:grid sm:grid-cols-10"
                >
                  {/* 데스크탑 레이아웃 */}
                  <div className="text-muted-foreground col-span-1 hidden text-center sm:block">
                    {post.isNotice ? (
                      <span className="font-semibold text-rose-500">공지</span>
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
                    <span className="text-foreground truncate font-medium">{post.title}</span>
                    {post.comments > 0 && (
                      <span className="flex-shrink-0 font-medium text-orange-500">
                        [{post.comments}]
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground col-span-2 hidden truncate text-center sm:block">
                    {post.author}
                  </div>
                  <div className="text-muted-foreground col-span-1 hidden text-center sm:block">
                    {post.timestamp}
                  </div>
                  <div className="text-muted-foreground col-span-1 hidden text-center tabular-nums sm:block">
                    {post.upvotes}
                  </div>
                  {/* 모바일 레이아웃 */}
                  <div className="grid grid-cols-12 items-center gap-1 sm:hidden">
                    <div className="col-span-8 flex min-w-0 items-center gap-1.5">
                      {post.isNotice && (
                        <span className="shrink-0 font-semibold text-rose-500">[공지]</span>
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
                      <span className="text-foreground truncate font-medium">{post.title}</span>
                      {post.comments > 0 && (
                        <span className="shrink-0 font-medium text-orange-500">
                          [{post.comments}]
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground col-span-4 truncate text-right">
                      {post.author}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-6 text-center">
                <p className="text-muted-foreground text-sm">아직 게시물이 없습니다.</p>
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
