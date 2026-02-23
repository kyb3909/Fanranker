import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import { type TipTapNode } from "@/components/post-card"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"

export type SortType = "random" | "hot" | "new"

export interface Post {
  id: string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  authorTemperature?: number
  userId?: string
  timestamp: string
  title: string
  content: string | TipTapNode
  image?: string
  upvotes: number
  comments: number
  temperature: number
  isUpvoted: boolean
  createdAt: Date
}

const PAGE_SIZE = 20

export function useFeed(sortBy: SortType, followedCommunities: Set<string>, followsLoaded: boolean) {
  const { isSignedIn } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)

  const transformPosts = useCallback(
    (
      fetchedPosts: {
        id: string
        user_id: string
        community_slug: string
        title: string
        content: string | TipTapNode
        image?: string
        vote_count?: number
        comment_count?: number
        temperature?: number
        created_at: string
      }[],
      profiles: {
        user_id: string
        nickname: string
        avatar_url: string | null
        temperature?: number
      }[]
    ) => {
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])
      return fetchedPosts.map((post) => {
        const profile = profileMap.get(post.user_id)
        return {
          id: post.id,
          community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
          communitySlug: post.community_slug,
          author: profile?.nickname || "익명",
          avatar: profile?.avatar_url || "/placeholder-user.jpg",
          authorTemperature: profile?.temperature ?? 0,
          userId: post.user_id,
          timestamp: formatRelativeTime(new Date(post.created_at)),
          title: post.title,
          content: post.content,
          image: post.image,
          upvotes: post.vote_count || 0,
          comments: post.comment_count || 0,
          temperature: post.temperature ?? 0,
          isUpvoted: false,
          createdAt: new Date(post.created_at),
        }
      })
    },
    []
  )

  // 첫 페이지 로드
  useEffect(() => {
    if (!followsLoaded) return

    async function fetchPosts() {
      setIsLoading(true)
      setOffset(0)
      setHasMore(true)
      try {
        const sortParam = sortBy === "hot" ? "hot" : "new"
        const slugsArray = Array.from(followedCommunities)
        const followedParam =
          isSignedIn && slugsArray.length > 0
            ? `&community_slugs=${slugsArray.join(",")}`
            : ""
        const response = await fetch(
          `/api/posts?sort=${sortParam}&limit=${PAGE_SIZE}&offset=0${followedParam}`
        )
        if (!response.ok) throw new Error("글 목록을 가져오는데 실패했습니다.")
        const { posts: fetchedPosts, profiles, hasMore: more } = await response.json()
        setPosts(transformPosts(fetchedPosts, profiles))
        setHasMore(more ?? fetchedPosts.length === PAGE_SIZE)
        setOffset(PAGE_SIZE)
      } catch {
        setPosts([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [sortBy, followedCommunities, followsLoaded, isSignedIn, transformPosts])

  // 추가 페이지 로드
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    setIsLoadingMore(true)
    try {
      const sortParam = sortBy === "hot" ? "hot" : "new"
      const slugsArray = Array.from(followedCommunities)
      const followedParam =
        isSignedIn && slugsArray.length > 0
          ? `&community_slugs=${slugsArray.join(",")}`
          : ""
      const response = await fetch(
        `/api/posts?sort=${sortParam}&limit=${PAGE_SIZE}&offset=${offset}${followedParam}`
      )
      if (!response.ok) throw new Error()
      const { posts: fetchedPosts, profiles, hasMore: more } = await response.json()
      const newPosts = transformPosts(fetchedPosts, profiles)
      setPosts((prev) => [...prev, ...newPosts])
      setHasMore(more ?? fetchedPosts.length === PAGE_SIZE)
      setOffset((prev) => prev + PAGE_SIZE)
    } catch {
      // 에러 시 무시
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, hasMore, sortBy, offset, isSignedIn, followedCommunities, transformPosts])

  // 정렬
  const sortedPosts = [...posts].sort((a, b) => {
    switch (sortBy) {
      case "random":
        return Math.random() - 0.5
      case "hot":
        return b.temperature - a.temperature
      case "new":
        return b.createdAt.getTime() - a.createdAt.getTime()
      default:
        return 0
    }
  })

  return {
    posts: sortedPosts,
    isLoading,
    isLoadingMore,
    loadMore,
  }
}
