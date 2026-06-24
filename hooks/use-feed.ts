import { useCallback, useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import useSWRInfinite from "swr/infinite"
import type { TipTapNode, PostFlair } from "@/types/post"
import type { TitleDisplay } from "@/types/user"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"
import { fetcher } from "@/lib/swr"

export type SortType = "random" | "hot" | "new"

export type { Post } from "@/types/post"
import type { Post } from "@/types/post"

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
  flair_id?: string | null
  // postgrest nested select — fk 관계라 단일 객체 또는 null. 일부 환경에서 배열로 올 수 있어 둘 다 허용.
  post_flairs?: PostFlair | PostFlair[] | null
}

interface RawProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
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
  flairTitles?: Record<string, string>
  hasMore?: boolean
}

function createdAtToMs(value: Post["createdAt"]): number {
  if (value == null) return 0
  if (value instanceof Date) return value.getTime()
  return new Date(value).getTime()
}

function transformPosts(
  fetchedPosts: RawPost[],
  profiles: RawProfile[],
  equippedTitles?: RawEquippedTitle[],
  flairTitles?: Record<string, string>
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

    // post_flairs 가 단일 객체일 수도, 배열일 수도 있음 (postgrest 동작 환경 차이)
    const rawFlair = Array.isArray(post.post_flairs) ? post.post_flairs[0] : post.post_flairs
    const flair: PostFlair | null = rawFlair?.id
      ? { id: rawFlair.id, name: rawFlair.name, color: rawFlair.color ?? null }
      : null

    return {
      id: post.id,
      community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
      communitySlug: post.community_slug,
      author: profile?.nickname || "익명",
      avatar: profile?.avatar_url || "/placeholder-user.jpg",
      userId: post.user_id,
      // ISO 그대로 — PostCardMeta 의 RelativeTime 컴포넌트가 client mount 후 변환.
      // formatRelativeTime 을 SSR 시점에 호출하면 client time 과 다른 결과가 나와
      // React #418 hydration mismatch 발생.
      timestamp: post.created_at,
      title: post.title,
      content: post.content,
      image: post.image,
      upvotes: post.vote_count || 0,
      comments: post.comment_count || 0,
      temperature: post.temperature ?? 0,
      isUpvoted: false,
      createdAt: new Date(post.created_at),
      titleDisplay,
      flairTitle: flairTitles?.[post.user_id] ?? null,
      flair,
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

  // 담벼락 말머리 개인화 — 내 prefs 를 받아 favorite(only)/mute(exclude) flair id 로 변환.
  // community_slugs 와 동일하게 URL 파라미터로 /api/posts 에 넘겨 CDN 캐시를 조합별로 유지.
  const { data: flairPrefsData } = useSWR<{ prefs: { flair_id: string; pref: string }[] }>(
    isSignedIn ? "/api/flair-prefs" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )
  const { onlyFlairs, excludeFlairs } = useMemo(() => {
    const prefs = flairPrefsData?.prefs ?? []
    return {
      onlyFlairs: prefs.filter((p) => p.pref === "favorite").map((p) => p.flair_id),
      excludeFlairs: prefs.filter((p) => p.pref === "mute").map((p) => p.flair_id),
    }
  }, [flairPrefsData])

  // 홈 SSR initialFeed는 항상 온도순(hot) + 전체 게시판(또는 비로그인/팔로우 0과 동일한 쿼리)만 의미가 있다.
  // 그 외(최신순·랜덤·팔로우 필터)에 동일 fallback을 쓰면 SWR이 재검증 없이 잘못된 순서를 유지한다.
  const useServerHydratedFallback = Boolean(
    initialData &&
    sortBy === "hot" &&
    (!isSignedIn || slugsArray.length === 0) &&
    onlyFlairs.length === 0 &&
    excludeFlairs.length === 0
  )

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
      const onlyParam = onlyFlairs.length > 0 ? `&only_flairs=${onlyFlairs.join(",")}` : ""
      const excludeParam =
        excludeFlairs.length > 0 ? `&exclude_flairs=${excludeFlairs.join(",")}` : ""

      return `/api/posts?sort=${sortParam}&limit=${PAGE_SIZE}&offset=${offset}${followedParam}${onlyParam}${excludeParam}`
    },
    [sortBy, followsLoaded, isSignedIn, slugsArray, onlyFlairs, excludeFlairs]
  )

  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite<PostsResponse>(
    getKey,
    fetcher,
    {
      fallbackData: useServerHydratedFallback && initialData ? [initialData] : undefined,
      revalidateOnFocus: false,
      revalidateIfStale: !useServerHydratedFallback,
      revalidateFirstPage: false,
      dedupingInterval: 10000,
    }
  )

  const posts = useMemo(() => {
    if (!data) return []
    const allPosts = data.flatMap((page) =>
      transformPosts(page.posts || [], page.profiles || [], page.equippedTitles, page.flairTitles)
    )

    // ID 기반 중복 제거 (페이지 간 동일 게시글 제거)
    const seen = new Set<string>()
    const uniquePosts = allPosts.filter((post) => {
      const id = String(post.id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })

    // 제목 기반 유사 중복 제거 (크롤링으로 인한 동일 제목 게시글)
    const seenTitles = new Map<string, string>() // normalized title → first post id
    const dedupedPosts = uniquePosts.filter((post) => {
      const id = String(post.id)
      const normalized = post.title.trim().toLowerCase()
      const existing = seenTitles.get(normalized)
      if (existing && existing !== id) return false
      seenTitles.set(normalized, id)
      return true
    })

    if (sortBy === "random") {
      return [...dedupedPosts].sort(() => Math.random() - 0.5)
    }
    if (sortBy === "new") {
      return [...dedupedPosts].sort(
        (a, b) => createdAtToMs(b.createdAt) - createdAtToMs(a.createdAt)
      )
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
