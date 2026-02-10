"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { PostCard } from "@/components/post-card"
import { FeedAdSlot } from "@/components/feed-ad-slot"
import { Dices, Flame, Clock, Loader2 } from "lucide-react"

const PAGE_SIZE = 15
const AD_EVERY_N_POSTS = 5

function EmptyFeedCharacter() {
  const [imgError, setImgError] = useState(false)
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 p-8 sm:p-10">
        <div className="order-2 sm:order-1 relative max-w-[280px] sm:max-w-xs">
          <div className="bg-primary/10 border-2 border-primary/20 rounded-2xl sm:rounded-r-2xl sm:rounded-bl-2xl rounded-bl-sm px-5 py-4 shadow-sm">
            <p className="text-[15px] font-medium text-foreground leading-relaxed">아직 보여줄 글이 없어요!</p>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">왼쪽 메뉴에서 별(⭐)을 눌러 게시판을 팔로우해보세요. 로그인하면 더 많은 게시판을 즐길 수 있어요.</p>
          </div>
          <div className="absolute left-8 bottom-0 translate-y-full sm:hidden w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-primary/20" aria-hidden />
          <div className="hidden sm:block absolute -right-3 bottom-6 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[12px] border-l-primary/20" aria-hidden />
        </div>
        <div className="order-1 sm:order-2 flex-shrink-0 w-32 h-32 sm:w-40 sm:h-40 relative">
          {!imgError ? (
            <Image src="/empty-feed-character.webp" alt="" fill className="object-contain object-bottom" sizes="(max-width: 640px) 128px, 160px" unoptimized onError={() => setImgError(true)} />
          ) : (
            <div className="w-full h-full rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-4xl" aria-hidden>🙂</div>
          )}
        </div>
      </div>
    </div>
  )
}

type SortType = "random" | "hot" | "new"

const COMMUNITY_NAMES: Record<string, string> = {
  "overseas-football": "해외축구",
  "domestic-football": "국내축구",
  "baseball": "야구",
  "basketball": "농구",
  "volleyball": "배구",
  "esports": "e스포츠",
  "free-board": "자유게시판",
  "tips": "정보게시판",
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

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
  userId?: string
}

interface HomeFeedProps {
  initialPosts: Post[]
}

function mapApiPostsToPost(rawPosts: any[], profiles: any[]): Post[] {
  const profileMap = new Map(profiles.map((p: { user_id: string; nickname?: string; avatar_url?: string }) => [p.user_id, p]))
  return rawPosts.map((p: any) => {
    const profile = profileMap.get(p.user_id)
    return {
      id: p.id,
      userId: p.user_id,
      community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
      communitySlug: p.community_slug,
      author: profile?.nickname || "익명",
      avatar: profile?.avatar_url || "/placeholder-user.jpg",
      timestamp: formatRelativeTime(new Date(p.created_at)),
      title: p.title,
      content: p.content,
      image: p.image,
      upvotes: p.vote_count || 0,
      comments: p.comment_count || 0,
      temperature: p.temperature,
      isUpvoted: false,
      createdAt: new Date(p.created_at),
    }
  })
}

export function HomeFeed({ initialPosts }: HomeFeedProps) {
  const [sortBy, setSortBy] = useState<SortType>("random")
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length >= 50)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  useEffect(() => {
    offsetRef.current = posts.length
  }, [posts.length])

  useEffect(() => {
    if (initialPosts.length > 0) {
      setPosts(initialPosts)
      setHasMore(initialPosts.length >= 50)
      offsetRef.current = initialPosts.length
      return
    }
    setLoadingFeed(true)
    fetch("/api/posts?sort=new&limit=50&offset=0")
      .then((res) => (res.ok ? res.json() : { posts: [], profiles: [] }))
      .then((data) => {
        const transformed = mapApiPostsToPost(data.posts || [], data.profiles || [])
        setPosts(transformed)
        setHasMore((data.posts || []).length >= 50)
        offsetRef.current = transformed.length
      })
      .catch(() => setPosts([]))
      .finally(() => setLoadingFeed(false))
  }, [initialPosts.length])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const offset = offsetRef.current
    const sortParam = sortBy === "random" ? "new" : sortBy === "hot" ? "hot" : "new"
    fetch(`/api/posts?sort=${sortParam}&limit=${PAGE_SIZE}&offset=${offset}`)
      .then((res) => (res.ok ? res.json() : { posts: [], profiles: [] }))
      .then((data) => {
        const next = mapApiPostsToPost(data.posts || [], data.profiles || [])
        if (next.length === 0) {
          setHasMore(false)
          return
        }
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id))
          const newPosts = next.filter((p) => !existingIds.has(p.id))
          return [...prev, ...newPosts]
        })
        setHasMore((data.posts || []).length >= PAGE_SIZE)
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false))
  }, [sortBy, loadingMore, hasMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && posts.length > 0) loadMore()
      },
      { root: scrollRef.current, rootMargin: "200px", threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore, loadingMore, posts.length])

  const sortedPosts = useMemo(() => {
    const list = [...posts]
    if (sortBy === "random") {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]]
      }
      return list
    }
    return list.sort((a, b) => {
      switch (sortBy) {
        case "hot":
          return (b.temperature ?? 0) - (a.temperature ?? 0)
        case "new":
          return b.createdAt.getTime() - a.createdAt.getTime()
        default:
          return 0
      }
    })
  }, [posts, sortBy])

  const feedItems = useMemo(() => {
    const items: Array<{ type: "post"; post: Post; index: number } | { type: "ad"; key: string }> = []
    sortedPosts.forEach((post, index) => {
      if (index > 0 && index % AD_EVERY_N_POSTS === 0) items.push({ type: "ad", key: `ad-${index}` })
      items.push({ type: "post", post, index })
    })
    return items
  }, [sortedPosts])

  return (
    <div className="col-span-12 lg:col-span-6 flex flex-col max-h-[calc(100vh-6.5rem)] min-h-0">
      {/* 정렬 바: 고정, 스크롤 안 됨 */}
      <div className="shrink-0 bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setSortBy("random")}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] ${
              sortBy === "random"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Dices className="w-4 h-4" />
            랜덤
          </button>
          <button
            onClick={() => setSortBy("hot")}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] ${
              sortBy === "hot"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Flame className="w-4 h-4" />
            온도순
          </button>
          <button
            onClick={() => setSortBy("new")}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] ${
              sortBy === "new"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Clock className="w-4 h-4" />
            최신순
          </button>
        </div>
      </div>
      {/* 게시글 목록: 여기만 스크롤, 스크롤바 숨김 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-3 pr-1 scrollbar-hide">
        {loadingFeed ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">피드를 불러오는 중...</p>
          </div>
        ) : feedItems.length > 0 ? (
          <>
            {feedItems.map((item) =>
              item.type === "post" ? (
                <PostCard key={item.post.id} post={item.post} priority={item.index < 3} />
              ) : (
                <FeedAdSlot key={item.key} />
              )
            )}
            {hasMore && <div ref={sentinelRef} className="h-4" aria-hidden />}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        ) : (
          <EmptyFeedCharacter />
        )}
      </div>
    </div>
  )
}
