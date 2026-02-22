'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { CommunitySidebar } from '@/components/community-sidebar'
import { ActivitySidebar } from '@/components/activity-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search as SearchIcon, User, Hash, FileText, FileTextIcon } from 'lucide-react'
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

type SearchType = 'nickname' | 'id' | 'title' | 'title_content'

const SEARCH_TYPE_OPTIONS = [
  { value: 'title_content', label: '제목 + 내용', icon: FileTextIcon },
  { value: 'title', label: '제목', icon: FileText },
  { value: 'nickname', label: '닉네임', icon: User },
  { value: 'id', label: 'ID', icon: Hash },
] as const

// 상대적 시간 포맷팅
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
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [searchType, setSearchType] = useState<SearchType>(
    (searchParams.get('type') as SearchType) || 'title_content'
  )
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // URL에서 검색어가 있으면 자동 검색
  useEffect(() => {
    const q = searchParams.get('q')
    const type = (searchParams.get('type') as SearchType) || 'title_content'
    if (q && q.trim().length > 0) {
      setSearchQuery(q)
      setSearchType(type)
      handleSearch(q, type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSearch = async (query?: string, type?: SearchType) => {
    const finalQuery = query || searchQuery
    const finalType = type || searchType

    if (!finalQuery || finalQuery.trim().length === 0) {
      return
    }

    setIsLoading(true)
    setHasSearched(true)
    setErrorMessage(null)

    try {
      // URL 업데이트
      const params = new URLSearchParams()
      params.set('q', finalQuery.trim())
      params.set('type', finalType)
      router.push(`/search?${params.toString()}`, { scroll: false })

      // API 호출
      const response = await fetch(`/api/search?q=${encodeURIComponent(finalQuery.trim())}&type=${finalType}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }))
        throw new Error(errorData.error || `검색에 실패했습니다. (${response.status})`)
      }

      const data = await response.json()
      const { posts: fetchedPosts, profiles } = data || { posts: [], profiles: [] }

      // 프로필 매핑
      const profileMap = new Map<string, { user_id: string; nickname: string; avatar_url: string | null }>(profiles?.map((p: { user_id: string; nickname: string; avatar_url: string | null }) => [p.user_id, p]) || [])

      // 데이터 변환
      const transformedPosts: Post[] = (fetchedPosts || []).map((post: { id: string; user_id: string; community_slug: string; title: string; content: string | Record<string, unknown>; image?: string; vote_count?: number; comment_count?: number; created_at: string }) => {
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
      })

      setPosts(transformedPosts)
    } catch (error) {
      setPosts([])
      // 사용자에게 에러 메시지 표시
      if (error instanceof Error) {
        setErrorMessage(error.message || '검색 중 오류가 발생했습니다.')
      } else {
        setErrorMessage('검색 중 오류가 발생했습니다.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const selectedTypeOption = SEARCH_TYPE_OPTIONS.find(opt => opt.value === searchType)

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]" tabIndex={-1}>
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <aside className="hidden lg:block col-span-3">
            <CommunitySidebar />
          </aside>
          <div className="col-span-12 lg:col-span-6 space-y-4">
            {/* 검색 헤더 */}
            <div className="space-y-4">
              <h1 className="text-2xl font-bold text-foreground">검색</h1>

              {/* 검색 폼 */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-2">
                  {/* 검색 타입 선택 */}
                  <Select value={searchType} onValueChange={(value) => setSearchType(value as SearchType)}>
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
                  <div className="flex-1 relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={
                        searchType === 'nickname' ? '닉네임을 입력하세요...' :
                        searchType === 'id' ? '글 ID를 입력하세요...' :
                        searchType === 'title' ? '제목을 입력하세요...' :
                        '제목 또는 내용을 입력하세요...'
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSubmit(e)
                        }
                      }}
                      className="pl-10 h-10"
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
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
                  <p className="text-sm text-destructive font-medium mb-2">
                    {errorMessage}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    잠시 후 다시 시도해주세요.
                  </p>
                </div>
              ) : isLoading ? (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">검색 중...</p>
                </div>
              ) : hasSearched && posts.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    검색 결과가 없습니다.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    다른 검색어나 검색 타입을 시도해보세요.
                  </p>
                </div>
              ) : hasSearched && posts.length > 0 ? (
                <>
                  <div className="text-sm text-muted-foreground mb-2">
                    검색 결과: <span className="font-semibold text-foreground">{posts.length}개</span>
                  </div>
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    {/* 게시판 목록 헤더 */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-[12px] font-semibold text-muted-foreground">
                      <div className="col-span-6 sm:col-span-7">제목</div>
                      <div className="col-span-3 sm:col-span-2">게시판</div>
                      <div className="col-span-3 sm:col-span-3 text-right">작성일</div>
                    </div>
                    {/* 목록 행 */}
                    {posts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.id}`}
                        className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors items-center"
                      >
                        <div className="col-span-6 sm:col-span-7 text-[14px] font-medium text-foreground truncate pr-2">
                          {post.title}
                        </div>
                        <div className="col-span-3 sm:col-span-2 text-[13px] text-muted-foreground truncate">
                          {post.community}
                        </div>
                        <div className="col-span-3 sm:col-span-3 text-[12px] text-muted-foreground text-right shrink-0">
                          {post.timestamp}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-card border border-border rounded-lg p-8 text-center">
                  <SearchIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground mb-2">
                    검색어를 입력하고 검색 버튼을 누르세요.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    검색 타입을 선택하여 원하는 방식으로 검색할 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          </div>
          <aside className="hidden lg:block col-span-3">
            <ActivitySidebar />
          </aside>
        </div>
      </main>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <Header />
        <main id="main-content" className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]" tabIndex={-1}>
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          </div>
        </main>
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
