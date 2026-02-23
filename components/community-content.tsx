"use client"

import { useState, useMemo, useEffect } from "react"
import { Users, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"

type SortType = "hot" | "new" | "comments"

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
}

export function CommunityContent({ community, posts, isMainContent = false, communitySlug }: CommunityContentProps) {
  const { isSignedIn } = useAuth()
  const [sortBy, setSortBy] = useState<SortType>("hot")
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  // 팔로우 상태 확인
  useEffect(() => {
    if (!isSignedIn || !communitySlug) return
    fetch(`/api/community/${communitySlug}/follow`)
      .then(res => res.ok ? res.json() : { following: false })
      .then(data => setIsFollowing(data.following))
      .catch(() => {})
  }, [isSignedIn, communitySlug])

  const handleFollow = async () => {
    if (!isSignedIn) {
      alert('로그인이 필요합니다.')
      return
    }
    if (!communitySlug || isFollowLoading) return
    setIsFollowLoading(true)
    try {
      const method = isFollowing ? 'DELETE' : 'POST'
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

  const sortedPosts = useMemo(() => [...posts].sort((a, b) => {
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
  }), [posts, sortBy])

  if (!isMainContent) {
    return (
      <>
        {/* 커뮤니티 콘텐츠: 컴팩트한 간격 */}
        <div className="py-4">
          {/* 커뮤니티 헤더: 간격 축소 */}
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-foreground">{community.name}</h1>
              <p className="text-sm text-muted-foreground">{community.description}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{community.members}</span>
                </div>
              </div>
            </div>
            <Button
              variant={isFollowing ? "default" : "outline"}
              size="sm"
              className="h-8 text-sm px-4 font-medium"
              onClick={handleFollow}
              disabled={isFollowLoading}
            >
              {isFollowing ? "팔로잉" : "팔로우"}
            </Button>
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {/* 테이블 상단: 컴팩트한 패딩 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-foreground">전체 {posts.length.toLocaleString()}건</span>
              </div>
              <div className="flex items-center gap-2">
                {communitySlug && (
                  <Link href={`/write?community=${communitySlug}`}>
                    <Button size="sm" className="h-7 text-xs px-3 gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      글쓰기
                    </Button>
                  </Link>
                )}
                <div className="flex gap-1">
                <Button variant={sortBy === "hot" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => setSortBy("hot")}>
                  온도순
                </Button>
                <Button variant={sortBy === "new" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => setSortBy("new")}>
                  최신순
                </Button>
                <Button
                  variant={sortBy === "comments" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setSortBy("comments")}
                >
                  댓글순
                </Button>
                </div>
              </div>
            </div>

            {/* 테이블 헤더: 컴팩트한 패딩 */}
            <div className="hidden sm:grid grid-cols-10 gap-2 px-3 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
              <div className="col-span-1 text-center">번호</div>
              <div className="col-span-5">제목</div>
              <div className="col-span-2 text-center">글쓴이</div>
              <div className="col-span-1 text-center">날짜</div>
              <div className="col-span-1 text-center">추천</div>
            </div>
            {/* 모바일 헤더 */}
            <div className="grid sm:hidden grid-cols-12 gap-1 px-3 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
              <div className="col-span-8">제목</div>
              <div className="col-span-4 text-right">글쓴이</div>
            </div>

            {/* 테이블 바디: 조밀한 행 간격 */}
            {sortedPosts.length > 0 ? (
              sortedPosts.map((post, index) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="block sm:grid sm:grid-cols-10 gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/50 transition-colors text-xs last:border-0"
                >
                  {/* 데스크탑 레이아웃 */}
                  <div className="hidden sm:block col-span-1 text-center text-muted-foreground">
                    {post.isNotice ? <span className="text-rose-500 font-semibold">공지</span> : posts.length - index}
                  </div>
                  <div className="hidden sm:flex col-span-5 items-center gap-1.5">
                    <span className="font-medium text-foreground truncate">{post.title}</span>
                    {post.comments > 0 && (
                      <span className="text-orange-500 font-medium flex-shrink-0">[{post.comments}]</span>
                    )}
                  </div>
                  <div className="hidden sm:block col-span-2 text-center text-muted-foreground truncate">{post.author}</div>
                  <div className="hidden sm:block col-span-1 text-center text-muted-foreground">{post.timestamp}</div>
                  <div className="hidden sm:block col-span-1 text-center text-muted-foreground tabular-nums">{post.upvotes}</div>
                  {/* 모바일 레이아웃 */}
                  <div className="sm:hidden grid grid-cols-12 gap-1 items-center">
                    <div className="col-span-8 flex items-center gap-1.5 min-w-0">
                      {post.isNotice && <span className="text-rose-500 font-semibold shrink-0">[공지]</span>}
                      <span className="font-medium text-foreground truncate">{post.title}</span>
                      {post.comments > 0 && (
                        <span className="text-orange-500 font-medium shrink-0">[{post.comments}]</span>
                      )}
                    </div>
                    <div className="col-span-4 text-right text-muted-foreground truncate">{post.author}</div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">아직 게시물이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return null
}
