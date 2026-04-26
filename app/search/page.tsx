"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "@/components/ui/app-link"
import { CommunitySidebar } from "@/components/sidebar/community-sidebar"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Search as SearchIcon, User, Hash, FileText } from "lucide-react"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"

type SearchType = "nickname" | "id" | "title" | "title_content"

const SEARCH_TYPE_OPTIONS = [
  { value: "title_content", label: "제목", icon: FileText },
  { value: "nickname", label: "닉네임", icon: User },
  { value: "id", label: "ID", icon: Hash },
] as const

interface Post {
  id: string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | Record<string, unknown> // TipTap JSON or string
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  createdAt: Date
}

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "")
  const [searchType, setSearchType] = useState<SearchType>(
    (searchParams.get("type") as SearchType) || "title_content"
  )
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const PAGE_SIZE = 20

  // URL에서 검색어가 있으면 자동 검색 (초기 진입 시에만)
  const initialSearchDone = useState(false)
  useEffect(() => {
    if (initialSearchDone[0]) return
    const q = searchParams.get("q")
    const type = (searchParams.get("type") as SearchType) || "title_content"
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
      // API 호출
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

      // 프로필 매핑
      const profileMap = new Map<
        string,
        { user_id: string; nickname: string; avatar_url: string | null }
      >(
        profiles?.map((p: { user_id: string; nickname: string; avatar_url: string | null }) => [
          p.user_id,
          p,
        ]) || []
      )

      // 데이터 변환
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

    // URL 업데이트
    const params = new URLSearchParams()
    params.set("q", finalQuery)
    params.set("type", finalType)
    router.push(`/search?${params.toString()}`, { scroll: false })

    // API 호출
    performSearch(finalQuery, finalType)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const selectedTypeOption = SEARCH_TYPE_OPTIONS.find((opt) => opt.value === searchType)

  return (
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
          {/* 검색 헤더 */}
          <div className="space-y-4">
            <h1 className="text-foreground text-2xl font-bold">검색</h1>

            {/* 검색 폼 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                {/* 검색 타입 선택 */}
                <Select
                  value={searchType}
                  onValueChange={(value) => setSearchType(value as SearchType)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue>
                      {selectedTypeOption && (
                        <div className="flex items-center gap-2">
                          <selectedTypeOption.icon className="h-4 w-4" />
                          <span>{selectedTypeOption.label}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SEARCH_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <option.icon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 검색 입력 */}
                <div className="relative flex-1">
                  <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
                  <Input
                    type="text"
                    placeholder={
                      searchType === "nickname"
                        ? "닉네임을 입력하세요..."
                        : searchType === "id"
                          ? "글 ID를 입력하세요..."
                          : searchType === "title"
                            ? "제목을 입력하세요..."
                            : "제목 또는 내용을 입력하세요..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSubmit(e)
                      }
                    }}
                    className="h-10 pl-10"
                  />
                </div>

                {/* 검색 버튼 */}
                <Button type="submit" disabled={isLoading || !searchQuery.trim()}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      검색 중...
                    </>
                  ) : (
                    <>
                      <SearchIcon className="mr-2 h-4 w-4" />
                      검색
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* 검색 결과 */}
          <div className="space-y-3">
            {errorMessage ? (
              <div className="bg-destructive/10 border-destructive/20 rounded-lg border p-6 text-center">
                <p className="text-destructive mb-2 text-sm font-medium">{errorMessage}</p>
                <p className="text-muted-foreground text-xs">잠시 후 다시 시도해주세요.</p>
              </div>
            ) : isLoading ? (
              <div className="bg-card border-border rounded-lg border p-8 text-center">
                <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
                <p className="text-muted-foreground text-sm">검색 중...</p>
              </div>
            ) : hasSearched && posts.length === 0 ? (
              <div className="bg-card border-border rounded-lg border p-8 text-center">
                <p className="text-muted-foreground mb-2 text-sm">검색 결과가 없습니다.</p>
                <p className="text-muted-foreground text-xs">
                  다른 검색어나 검색 타입을 시도해보세요.
                </p>
              </div>
            ) : hasSearched && posts.length > 0 ? (
              <>
                <div className="text-muted-foreground mb-2 text-sm">
                  검색 결과: <span className="text-foreground font-semibold">{posts.length}개</span>
                </div>
                <div className="bg-card border-border overflow-hidden rounded-lg border">
                  {/* 게시판 목록 헤더 */}
                  <div className="bg-muted/40 border-border text-muted-foreground grid grid-cols-12 gap-2 border-b px-4 py-2.5 text-[12px] font-semibold">
                    <div className="col-span-6 sm:col-span-7">제목</div>
                    <div className="col-span-3 sm:col-span-2">게시판</div>
                    <div className="col-span-3 text-right sm:col-span-3">작성일</div>
                  </div>
                  {/* 목록 행 */}
                  {posts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      className="border-border hover:bg-muted/40 grid grid-cols-12 items-center gap-2 border-b px-4 py-2.5 transition-colors last:border-b-0"
                    >
                      <div className="text-foreground col-span-6 truncate pr-2 text-[14px] font-medium sm:col-span-7">
                        {post.title}
                      </div>
                      <div className="text-muted-foreground col-span-3 truncate text-[13px] sm:col-span-2">
                        {post.community}
                      </div>
                      <div className="text-muted-foreground col-span-3 shrink-0 text-right text-[12px] sm:col-span-3">
                        {post.timestamp}
                      </div>
                    </Link>
                  ))}
                </div>
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
              <div className="bg-card border-border rounded-lg border p-8 text-center">
                <SearchIcon className="text-muted-foreground mx-auto mb-4 h-12 w-12 opacity-50" />
                <p className="text-muted-foreground mb-2 text-sm">
                  검색어를 입력하고 검색 버튼을 누르세요.
                </p>
                <p className="text-muted-foreground text-xs">
                  검색 타입을 선택하여 원하는 방식으로 검색할 수 있습니다.
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
          <div className="bg-card border-border rounded-lg border p-8 text-center">
            <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">로딩 중...</p>
          </div>
        </main>
      }
    >
      <SearchContent />
    </Suspense>
  )
}
