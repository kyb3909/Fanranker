"use client"

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { Search, Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { useRouter } from "next/navigation"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

interface SearchResultPost {
  id: string
  title: string
  community_slug: string
  user_id: string
  created_at: string
}

export function HeaderSearch() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResultPost[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchedOnce, setSearchedOnce] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setSearchResults([])
      setDropdownOpen(false)
      setSearchedOnce(false)
      return
    }
    setSearchLoading(true)
    setDropdownOpen(true)
    setSearchedOnce(true)
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&type=title_content&limit=8`
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.posts)) {
        setSearchResults(data.posts)
      } else {
        setSearchResults([])
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => runSearch(q), 300)
    },
    [runSearch]
  )
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      const q = searchQuery.trim()
      if (q) {
        setDropdownOpen(false)
        router.push(`/search?q=${encodeURIComponent(q)}&type=title_content`)
      }
    }
  }

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [])

  return (
    <div className="relative hidden w-[min(100%,400px)] shrink-0 sm:block" ref={containerRef}>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="text"
          placeholder="검색..."
          aria-label="게시글 검색"
          value={searchQuery}
          onChange={(e) => {
            const val = e.target.value
            setSearchQuery(val)
            if (!val.trim()) {
              if (debounceRef.current) clearTimeout(debounceRef.current)
              setSearchResults([])
              setDropdownOpen(false)
              setSearchedOnce(false)
            } else {
              debouncedSearch(val)
            }
          }}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => searchResults.length > 0 && setDropdownOpen(true)}
          className="text-foreground focus:ring-primary/30 h-10 w-full rounded-full border border-transparent bg-[#F5F5F5] pr-4 pl-9 text-[14px] placeholder:text-[#999999] focus:border-[#E0E0E0] focus:ring-2 focus:outline-none"
        />
        {searchLoading && (
          <Loader2 className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin" />
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {searchLoading
          ? "검색 중..."
          : searchedOnce && !searchLoading
            ? `${searchResults.length}개의 검색 결과`
            : ""}
      </div>
      {dropdownOpen && (searchLoading || searchResults.length > 0 || searchedOnce) && (
        <div
          className="bg-card border-border absolute top-full right-0 left-0 z-50 mt-1 max-h-[320px] overflow-y-auto rounded-lg border py-1 shadow-lg"
          role="listbox"
          aria-label="검색 결과"
        >
          {searchLoading ? (
            <div className="text-muted-foreground flex items-center justify-center py-6 text-sm">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              검색 중...
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              검색 결과가 없습니다.
            </p>
          ) : (
            <>
              {searchResults.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  onClick={() => setDropdownOpen(false)}
                  className="hover:bg-muted/60 block px-4 py-2.5 text-left"
                >
                  <p className="text-foreground line-clamp-1 text-[14px] font-medium">
                    {post.title}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[12px]">
                    {COMMUNITY_NAMES[post.community_slug] || post.community_slug}
                  </p>
                </Link>
              ))}
              <Link
                href={`/search?q=${encodeURIComponent(searchQuery.trim())}&type=title_content`}
                onClick={() => setDropdownOpen(false)}
                className="text-primary hover:bg-muted/60 border-border block border-t px-4 py-2.5 text-center text-[13px] font-medium"
              >
                전체 검색 결과 보기
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
