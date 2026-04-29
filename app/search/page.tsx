"use client"

import { useState, useEffect, Suspense, useMemo, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import useSWR from "swr"
import Link from "@/components/ui/app-link"
import { Loader2, Search as SearchIcon, ChevronDown, FileText, User, Hash } from "lucide-react"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"
import { fetcher } from "@/lib/swr"
import { MinimalShell } from "@/components/minimal-sport/minimal-shell"
import { MinimalTopbar } from "@/components/minimal-sport/minimal-topbar"
import { MinimalSidebar } from "@/components/minimal-sport/minimal-sidebar"
import { MinimalRightAside } from "@/components/minimal-sport/minimal-right-aside"
import { MinimalPrizeCard } from "@/components/minimal-sport/minimal-prize-card"
import { MinimalTalkList, type TalkItem } from "@/components/minimal-sport/minimal-talk-list"

type SearchType = "nickname" | "id" | "title" | "title_content"

const SEARCH_TYPE_OPTIONS: { value: SearchType; label: string; icon: typeof FileText }[] = [
  { value: "title_content", label: "제목·내용", icon: FileText },
  { value: "title", label: "제목만", icon: FileText },
  { value: "nickname", label: "닉네임", icon: User },
  { value: "id", label: "글 ID", icon: Hash },
]

interface SearchResultPost {
  id: string
  title: string
  community_slug: string
  user_id: string
  vote_count?: number
  comment_count?: number
  created_at: string
}

interface SearchResultProfile {
  user_id: string
  nickname: string
  avatar_url: string | null
}

interface RawCategory {
  id: number | string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  parent_slug?: string | null
}

const PAGE_SIZE = 20

function groupCategories(cats: RawCategory[]) {
  const parents = cats.filter((c) => !c.parent_slug)
  const sports = parents
    .filter((c) => c.sort_order <= 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  const life = parents
    .filter((c) => c.sort_order > 4)
    .map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))
  return { sports, life }
}

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 초기 state는 빈 값으로 — SSR과 hydration mismatch 방지. 마운트 후 useEffect에서 URL 동기화.
  const [query, setQuery] = useState("")
  const [type, setType] = useState<SearchType>("title_content")
  const [posts, setPosts] = useState<SearchResultPost[]>([])
  const [profiles, setProfiles] = useState<Record<string, SearchResultProfile>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const typeMenuRef = useRef<HTMLDivElement>(null)

  // 사이드바/우측 위젯용 데이터 (다른 페이지와 SWR 캐시 공유)
  const { data: catData } = useSWR<{ categories: RawCategory[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })
  const { data: talkData } = useSWR<{ posts: TalkItem[] }>(
    "/api/posts?sort=recent_comment&limit=10",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  )
  const categories = useMemo(() => catData?.categories ?? [], [catData])
  const { sports, life } = useMemo(() => groupCategories(categories), [categories])
  const recentComments: TalkItem[] = useMemo(
    () =>
      (talkData?.posts ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        community_slug: t.community_slug,
        comment_count: t.comment_count,
      })),
    [talkData]
  )

  const performSearch = useCallback(
    async (q: string, t: SearchType, loadMore = false) => {
      const trimmed = q.trim()
      if (!trimmed) return
      if (loadMore) setIsLoadingMore(true)
      else {
        setIsLoading(true)
        setHasSearched(true)
      }
      setErrorMessage(null)
      const offset = loadMore ? posts.length : 0
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=${t}&limit=${PAGE_SIZE}&offset=${offset}`
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `검색 실패 (${res.status})`)
        }
        const data = await res.json()
        const fetchedPosts: SearchResultPost[] = data.posts ?? []
        const fetchedProfiles: SearchResultProfile[] = data.profiles ?? []
        const profileMap = Object.fromEntries(fetchedProfiles.map((p) => [p.user_id, p]))
        setProfiles((prev) => (loadMore ? { ...prev, ...profileMap } : profileMap))
        setPosts((prev) => (loadMore ? [...prev, ...fetchedPosts] : fetchedPosts))
        setHasMore(fetchedPosts.length >= PAGE_SIZE)
      } catch (e) {
        if (!loadMore) setPosts([])
        setErrorMessage(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.")
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [posts.length]
  )

  // URL ?q= 변경 시 자동 검색
  useEffect(() => {
    const q = searchParams.get("q")?.trim()
    const t = (searchParams.get("type") as SearchType) || "title_content"
    if (q) {
      setQuery(q)
      setType(t)
      performSearch(q, t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 외부 클릭 시 type menu 닫기
  useEffect(() => {
    if (!typeMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [typeMenuOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    const params = new URLSearchParams()
    params.set("q", trimmed)
    params.set("type", type)
    router.push(`/search?${params.toString()}`, { scroll: false })
    performSearch(trimmed, type)
  }

  const selectedType = SEARCH_TYPE_OPTIONS.find((o) => o.value === type) ?? SEARCH_TYPE_OPTIONS[0]
  const SelectedTypeIcon = selectedType.icon

  return (
    <MinimalShell
      topbar={<MinimalTopbar active="담벼락" />}
      sidebar={<MinimalSidebar sports={sports} life={life} />}
      aside={
        <MinimalRightAside>
          <MinimalPrizeCard />
          <MinimalTalkList items={recentComments} />
        </MinimalRightAside>
      }
    >
      {/* Crumb + Heading */}
      <div className="mb-5">
        <div className="text-[13px]" style={{ color: "var(--ms-ink-3)" }}>
          전체 ·{" "}
          <b className="font-semibold" style={{ color: "var(--ms-ink-2)" }}>
            검색
          </b>
        </div>
        <h1
          className="mt-1 text-[24px] leading-[1.15] font-extrabold sm:text-[28px]"
          style={{ color: "var(--ms-ink)", letterSpacing: "-0.035em" }}
        >
          검색
        </h1>
      </div>

      {/* 검색 폼 */}
      <form onSubmit={handleSubmit} role="search" className="mb-5 flex flex-col gap-2 sm:flex-row">
        {/* type select dropdown */}
        <div ref={typeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setTypeMenuOpen((v) => !v)}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-[var(--ms-surface)] px-3.5 text-[13px] font-semibold sm:w-[150px]"
            style={{ borderColor: "var(--ms-line)", color: "var(--ms-ink)" }}
            aria-haspopup="listbox"
            aria-expanded={typeMenuOpen}
          >
            <span className="flex items-center gap-2">
              <SelectedTypeIcon className="h-4 w-4" style={{ color: "var(--ms-ink-3)" }} />
              {selectedType.label}
            </span>
            <ChevronDown className="h-4 w-4" style={{ color: "var(--ms-ink-3)" }} />
          </button>
          {typeMenuOpen && (
            <ul
              role="listbox"
              className="absolute top-full left-0 z-20 mt-1 w-[180px] overflow-hidden rounded-xl border bg-[var(--ms-surface)] shadow-md"
              style={{ borderColor: "var(--ms-line)" }}
            >
              {SEARCH_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const isActive = opt.value === type
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setType(opt.value)
                        setTypeMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--ms-bg-hover)]"
                      style={{
                        color: isActive ? "var(--ms-brand)" : "var(--ms-ink)",
                        backgroundColor: isActive ? "var(--ms-brand-soft)" : undefined,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 입력 */}
        <label
          className="flex h-10 flex-1 items-center gap-2 rounded-xl border bg-[var(--ms-surface)] px-3.5 text-[13px] focus-within:border-[var(--ms-line-hover)]"
          style={{ borderColor: "var(--ms-line)" }}
        >
          <SearchIcon className="h-4 w-4 shrink-0" style={{ color: "var(--ms-ink-3)" }} />
          <input
            type="text"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              type === "nickname"
                ? "닉네임을 입력하세요"
                : type === "id"
                  ? "글 ID를 입력하세요"
                  : "검색어를 입력하세요"
            }
            className="min-w-0 flex-1 bg-transparent text-[var(--ms-ink)] placeholder:text-[var(--ms-ink-3)] focus:outline-none"
            aria-label="검색어"
          />
        </label>

        {/* 제출 */}
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl px-5 text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "var(--ms-brand)" }}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              검색 중
            </>
          ) : (
            <>
              <SearchIcon className="h-4 w-4" />
              검색
            </>
          )}
        </button>
      </form>

      {/* 결과 영역 */}
      <SearchResults
        errorMessage={errorMessage}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasSearched={hasSearched}
        hasMore={hasMore}
        posts={posts}
        profiles={profiles}
        onLoadMore={() => performSearch(query, type, true)}
      />
    </MinimalShell>
  )
}

function SearchResults({
  errorMessage,
  isLoading,
  isLoadingMore,
  hasSearched,
  hasMore,
  posts,
  profiles,
  onLoadMore,
}: {
  errorMessage: string | null
  isLoading: boolean
  isLoadingMore: boolean
  hasSearched: boolean
  hasMore: boolean
  posts: SearchResultPost[]
  profiles: Record<string, SearchResultProfile>
  onLoadMore: () => void
}) {
  if (errorMessage) {
    return (
      <Card>
        <p className="text-[13px] font-semibold" style={{ color: "var(--ms-brand)" }}>
          {errorMessage}
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
          잠시 후 다시 시도해주세요.
        </p>
      </Card>
    )
  }
  if (isLoading) {
    return (
      <Card center>
        <Loader2
          className="mx-auto mb-2 h-6 w-6 animate-spin"
          style={{ color: "var(--ms-ink-3)" }}
        />
        <p className="text-[13px]" style={{ color: "var(--ms-ink-3)" }}>
          검색 중...
        </p>
      </Card>
    )
  }
  if (!hasSearched) {
    return (
      <Card center>
        <SearchIcon
          className="mx-auto mb-3 h-9 w-9 opacity-40"
          style={{ color: "var(--ms-ink-3)" }}
        />
        <p className="text-[13px]" style={{ color: "var(--ms-ink-2)" }}>
          검색어를 입력하고 검색을 누르세요.
        </p>
      </Card>
    )
  }
  if (posts.length === 0) {
    return (
      <Card center>
        <p className="text-[13px]" style={{ color: "var(--ms-ink-2)" }}>
          검색 결과가 없습니다.
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--ms-ink-3)" }}>
          다른 검색어나 검색 타입을 시도해보세요.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] font-semibold" style={{ color: "var(--ms-ink-3)" }}>
        검색 결과{" "}
        <b className="font-archivo font-extrabold tabular-nums" style={{ color: "var(--ms-ink)" }}>
          {posts.length}
        </b>
        개
      </p>
      <ul
        className="overflow-hidden rounded-2xl border bg-[var(--ms-surface)]"
        style={{ borderColor: "var(--ms-line)" }}
      >
        {posts.map((post) => {
          const profile = profiles[post.user_id]
          const community = COMMUNITY_NAMES[post.community_slug] || post.community_slug
          const time = formatRelativeTime(new Date(post.created_at))
          return (
            <li key={post.id}>
              <Link
                href={`/post/${post.id}`}
                className="block border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--ms-bg-hover)]"
                style={{ borderColor: "var(--ms-line)" }}
              >
                <div
                  className="flex items-center gap-2 text-[11px]"
                  style={{ color: "var(--ms-ink-3)" }}
                >
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: "var(--ms-brand-soft)",
                      color: "var(--ms-brand)",
                    }}
                  >
                    {community}
                  </span>
                  <span style={{ color: "var(--ms-ink-2)", fontWeight: 600 }}>
                    @{profile?.nickname || "익명"}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{time}</span>
                </div>
                <p
                  className="mt-1 text-[14px] leading-tight font-bold"
                  style={{ color: "var(--ms-ink)", letterSpacing: "-0.01em" }}
                >
                  {post.title}
                </p>
                {(post.vote_count != null || post.comment_count != null) && (
                  <div
                    className="mt-1.5 flex items-center gap-3 text-[11px] font-semibold"
                    style={{ color: "var(--ms-ink-3)" }}
                  >
                    {post.vote_count != null && <span>▲ {post.vote_count}</span>}
                    {post.comment_count != null && <span>💬 {post.comment_count}</span>}
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex h-9 items-center gap-1.5 rounded-full border px-5 text-[12px] font-bold transition-colors hover:border-[var(--ms-ink)] disabled:opacity-50"
            style={{
              borderColor: "var(--ms-line)",
              backgroundColor: "var(--ms-surface)",
              color: "var(--ms-ink)",
            }}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                불러오는 중
              </>
            ) : (
              "더 보기"
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function Card({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-[var(--ms-surface)] p-8 ${center ? "text-center" : ""}`}
      style={{ borderColor: "var(--ms-line)" }}
    >
      {children}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--ms-ink-3)" }} />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  )
}
