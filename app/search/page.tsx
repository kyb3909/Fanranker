"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "@/components/ui/app-link"
import { CommunitySidebar } from "@/components/sidebar/community-sidebar"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { Button } from "@/components/ui/button"
import { Loader2, Search as SearchIcon } from "lucide-react"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"
import { useBlockedUsers } from "@/hooks/use-blocked-users"
import { PageBand } from "@/components/page-band"

type SearchType = "nickname" | "id" | "title"

const SEARCH_TYPE_OPTIONS = [
  { value: "title", label: "제목" },
  { value: "nickname", label: "닉네임" },
  { value: "id", label: "ID" },
] as const

interface Post {
  id: string
  community: string
  communitySlug?: string
  userId?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | Record<string, unknown>
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  createdAt: Date
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <>{text}</>
  const q = query.trim()
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark
        style={{
          background: "#f2efea",
          color: "var(--wc-burgundy)",
          fontWeight: 700,
          padding: "0 1px",
          borderRadius: 3,
        }}
      >
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "")
  const validTypes: SearchType[] = ["title", "nickname", "id"]
  const [searchType, setSearchType] = useState<SearchType>(
    (validTypes.includes(searchParams.get("type") as SearchType)
      ? searchParams.get("type")
      : "title") as SearchType
  )
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { isBlocked } = useBlockedUsers()

  const PAGE_SIZE = 20

  const initialSearchDone = useState(false)
  useEffect(() => {
    if (initialSearchDone[0]) return
    const q = searchParams.get("q")
    const rawType = searchParams.get("type") as SearchType
    const type: SearchType = validTypes.includes(rawType) ? rawType : "title"
    if (q && q.trim().length > 0) {
      setSearchQuery(q)
      setSearchType(type)
      initialSearchDone[1](true)
      performSearch(q, type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const performSearch = async (query: string, type: SearchType, loadMore = false) => {
    if (loadMore) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
      setHasSearched(true)
    }
    setErrorMessage(null)

    const offset = loadMore ? posts.length : 0

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}&type=${type}&limit=${PAGE_SIZE}&offset=${offset}`
      )

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "알 수 없는 오류가 발생했습니다." }))
        throw new Error(errorData.error || `검색에 실패했습니다. (${response.status})`)
      }

      const data = await response.json()
      const { posts: fetchedPosts, profiles } = data || { posts: [], profiles: [] }

      const profileMap = new Map<
        string,
        { user_id: string; nickname: string; avatar_url: string | null }
      >(
        profiles?.map((p: { user_id: string; nickname: string; avatar_url: string | null }) => [
          p.user_id,
          p,
        ]) || []
      )

      const transformedPosts: Post[] = (fetchedPosts || []).map(
        (post: {
          id: string
          user_id: string
          community_slug: string
          title: string
          content: string | Record<string, unknown>
          image?: string
          vote_count?: number
          comment_count?: number
          created_at: string
        }) => {
          const profile = profileMap.get(post.user_id)
          return {
            id: post.id,
            community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
            communitySlug: post.community_slug,
            userId: post.user_id,
            author: profile?.nickname || "익명",
            avatar: profile?.avatar_url || "/placeholder-user.jpg",
            timestamp: formatRelativeTime(new Date(post.created_at)),
            title: post.title,
            content: post.content,
            image: post.image,
            upvotes: post.vote_count || 0,
            comments: post.comment_count || 0,
            isUpvoted: false,
            createdAt: new Date(post.created_at),
          }
        }
      )

      if (loadMore) {
        setPosts((prev) => [...prev, ...transformedPosts])
      } else {
        setPosts(transformedPosts)
      }
      setHasMore(transformedPosts.length >= PAGE_SIZE)
    } catch (error) {
      if (!loadMore) setPosts([])
      if (error instanceof Error) {
        setErrorMessage(error.message || "검색 중 오류가 발생했습니다.")
      } else {
        setErrorMessage("검색 중 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  const handleSearch = (query?: string, type?: SearchType) => {
    const finalQuery = (query || searchQuery).trim()
    const finalType = type || searchType

    if (!finalQuery) return

    const params = new URLSearchParams()
    params.set("q", finalQuery)
    params.set("type", finalType)
    router.push(`/search?${params.toString()}`, { scroll: false })

    performSearch(finalQuery, finalType)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  // 차단한 유저의 검색 결과는 숨김 (피드/댓글과 동일 클라 필터)
  const visiblePosts = posts.filter((p) => !p.userId || !isBlocked(p.userId))

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      {/* 담벼락·운동장과 같은 풀블리드 다크 밴드 */}
      <PageBand kicker="Search" title="검색" description="제목·본문·닉네임으로 찾는다." />
      <main
        id="main-content"
        className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <aside className="col-span-3 hidden lg:block">
            <CommunitySidebar />
          </aside>
          <div className="col-span-12 space-y-4 lg:col-span-6">
            {/* 검색 폼 */}
            <form onSubmit={handleSubmit} className="space-y-2">
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <SearchIcon
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 18,
                      height: 18,
                      color: "var(--wc-mute-2)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="게시물, 닉네임 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      height: 48,
                      padding: "0 14px 0 42px",
                      fontSize: 15,
                      fontFamily: "var(--font-sans)",
                      border: "1px solid var(--wc-line-2)",
                      borderRadius: 12,
                      outline: "none",
                      background: "#fff",
                      color: "var(--wc-ink)",
                      boxShadow: "var(--wc-shadow-1)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--wc-burgundy)"
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--wc-line-2)"
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    height: 48,
                    padding: "0 20px",
                    borderRadius: 12,
                    background: "var(--wc-burgundy)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  검색
                </button>
              </div>

              {/* 검색 타입 pills */}
              <div style={{ display: "flex", gap: 6 }}>
                {SEARCH_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSearchType(opt.value as SearchType)}
                    style={
                      searchType === opt.value
                        ? {
                            height: 30,
                            padding: "0 14px",
                            borderRadius: 20,
                            border: "1px solid var(--wc-burgundy)",
                            background: "var(--wc-burgundy)",
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }
                        : {
                            height: 30,
                            padding: "0 14px",
                            borderRadius: 20,
                            border: "1px solid var(--wc-line-2)",
                            background: "#fff",
                            color: "var(--wc-mute)",
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer",
                          }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </form>

            {/* 검색 결과 */}
            <div className="space-y-2">
              {errorMessage ? (
                <div
                  className="rounded-xl p-6 text-center"
                  style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
                >
                  <p className="mb-2 text-sm font-medium" style={{ color: "var(--wc-warn)" }}>
                    {errorMessage}
                  </p>
                  <p className="text-xs" style={{ color: "var(--wc-mute)" }}>
                    잠시 후 다시 시도해주세요.
                  </p>
                </div>
              ) : isLoading ? (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
                >
                  <Loader2
                    className="mx-auto mb-2 h-8 w-8 animate-spin"
                    style={{ color: "var(--wc-mute)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                    검색 중...
                  </p>
                </div>
              ) : hasSearched && posts.length === 0 ? (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
                >
                  <p className="mb-2 text-sm" style={{ color: "var(--wc-mute)" }}>
                    검색 결과가 없습니다.
                  </p>
                  <p className="text-xs" style={{ color: "var(--wc-mute-2)" }}>
                    다른 검색어나 검색 타입을 시도해보세요.
                  </p>
                </div>
              ) : hasSearched && posts.length > 0 ? (
                <>
                  <div className="text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
                    검색 결과 <b style={{ color: "var(--wc-burgundy)" }}>{visiblePosts.length}건</b>
                  </div>
                  {visiblePosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="gn-card-lift block overflow-hidden rounded-xl"
                      style={{
                        background: "var(--wc-card)",
                        border: "1px solid var(--wc-line)",
                        padding: "15px 18px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
                        >
                          {post.community}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--wc-mute-2)" }}>
                          {highlightMatch(post.author, searchQuery)} · {post.timestamp}
                        </span>
                      </div>
                      <h2
                        style={{
                          margin: "0 0 4px",
                          fontSize: 16,
                          fontWeight: 800,
                          letterSpacing: "-0.02em",
                          lineHeight: 1.4,
                        }}
                      >
                        {highlightMatch(post.title, searchQuery)}
                      </h2>
                      {typeof post.content === "string" && post.content && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13.5,
                            lineHeight: 1.55,
                            color: "var(--wc-mute)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden",
                          }}
                        >
                          {highlightMatch(post.content, searchQuery)}
                        </p>
                      )}
                    </Link>
                  ))}
                  {hasMore && (
                    <div className="py-4 text-center">
                      <Button
                        variant="outline"
                        onClick={() => performSearch(searchQuery, searchType, true)}
                        disabled={isLoadingMore}
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            불러오는 중...
                          </>
                        ) : (
                          "더 보기"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
                >
                  <SearchIcon
                    className="mx-auto mb-4 h-12 w-12 opacity-40"
                    style={{ color: "var(--wc-mute)" }}
                  />
                  <p className="mb-2 text-sm" style={{ color: "var(--wc-mute)" }}>
                    검색어를 입력하고 검색하세요.
                  </p>
                  <p className="text-xs" style={{ color: "var(--wc-mute-2)" }}>
                    타입을 선택하여 원하는 방식으로 검색할 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          </div>
          <aside className="col-span-3 hidden lg:block">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
          tabIndex={-1}
        >
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <Loader2
              className="mx-auto mb-2 h-8 w-8 animate-spin"
              style={{ color: "var(--wc-mute)" }}
            />
            <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
              로딩 중...
            </p>
          </div>
        </main>
      }
    >
      <SearchContent />
    </Suspense>
  )
}
