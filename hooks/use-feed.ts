import { useCallback, useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import useSWRInfinite from "swr/infinite"
import { type TipTapNode } from "@/components/post-card"
import { type TitleDisplay } from "@/components/profile/title-badge"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"
import { fetcher } from "@/lib/swr"

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
  titleDisplay?: TitleDisplay | null
}

const PAGE_SIZE = 20

interface RawPost {
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
}

interface RawProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
  temperature?: number
}

interface RawEquippedTitle {
  user_id: string
  board_slug: string
  adj_titles: { title: string; rarity: string } | null
  noun_titles: { title: string } | null
}

export interface PostsResponse {
  posts: RawPost[]
  profiles: RawProfile[]
  equippedTitles?: RawEquippedTitle[]
  hasMore?: boolean
}

function transformPosts(
  fetchedPosts: RawPost[],
  profiles: RawProfile[],
  equippedTitles?: RawEquippedTitle[]
): Post[] {
  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])

  // key: "user_id:board_slug" → title
  const titleMap = new Map<string, RawEquippedTitle>()
  if (equippedTitles) {
    for (const t of equippedTitles) {
      titleMap.set(`${t.user_id}:${t.board_slug}`, t)
    }
  }

  return fetchedPosts.map((post) => {
    const profile = profileMap.get(post.user_id)
    const equipped = titleMap.get(`${post.user_id}:${post.community_slug}`)
    const titleDisplay: TitleDisplay | null = equipped
      ? {
          adjTitle: equipped.adj_titles?.title || null,
          nounTitle: equipped.noun_titles?.title || null,
          rarity: (equipped.adj_titles?.rarity as TitleDisplay["rarity"]) || null,
        }
      : null

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
      titleDisplay,
    }
  })
}

export function useFeed(
  sortBy: SortType,
  followedCommunities: Set<string>,
  followsLoaded: boolean,
  initialData?: PostsResponse
) {
  const { isSignedIn } = useAuth()

  const slugsArray = useMemo(() => Array.from(followedCommunities), [followedCommunities])

  const getKey = useCallback(
    (pageIndex: number, previousPageData: PostsResponse | null) => {
      if (!followsLoaded) return null
      if (
        previousPageData &&
        (!previousPageData.posts || previousPageData.posts.length < PAGE_SIZE)
      )
        return null

      const sortParam = sortBy === "hot" ? "hot" : "new"
      const offset = pageIndex * PAGE_SIZE
      const followedParam =
        isSignedIn && slugsArray.length > 0 ? `&community_slugs=${slugsArray.join(",")}` : ""

      return `/api/posts?sort=${sortParam}&limit=${PAGE_SIZE}&offset=${offset}${followedParam}`
    },
    [sortBy, followsLoaded, isSignedIn, slugsArray]
  )

  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite<PostsResponse>(
    getKey,
    fetcher,
    {
      fallbackData: initialData ? [initialData] : undefined,
      revalidateOnFocus: false,
      revalidateFirstPage: false,
      dedupingInterval: 5000,
    }
  )

  const posts = useMemo(() => {
    if (!data) return []
    const allPosts = data.flatMap((page) =>
      transformPosts(page.posts || [], page.profiles || [], page.equippedTitles)
    )

    // ID 기반 중복 제거 (페이지 간 동일 게시글 제거)
    const seen = new Set<string>()
    const uniquePosts = allPosts.filter((post) => {
      if (seen.has(post.id)) return false
      seen.add(post.id)
      return true
    })

    // 제목 기반 유사 중복 제거 (크롤링으로 인한 동일 제목 게시글)
    const seenTitles = new Map<string, string>() // normalized title → first post id
    const dedupedPosts = uniquePosts.filter((post) => {
      const normalized = post.title.trim().toLowerCase()
      const existing = seenTitles.get(normalized)
      if (existing && existing !== post.id) return false
      seenTitles.set(normalized, post.id)
      return true
    })

    if (sortBy === "random") {
      return [...dedupedPosts].sort(() => Math.random() - 0.5)
    }
    return dedupedPosts
  }, [data, sortBy])

  const isLoadingMore = !isLoading && isValidating && size > 1

  const loadMore = useCallback(() => {
    if (isValidating) return
    setSize((s) => s + 1)
  }, [isValidating, setSize])

  return {
    posts,
    isLoading: isLoading && !error,
    isLoadingMore,
    loadMore,
  }
}
