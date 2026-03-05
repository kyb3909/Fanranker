"use client"

import { Button } from "@/components/ui/button"
import { Compass, LayoutGrid, Bell, Search, Loader2, Trophy } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react"
import { SignedIn, SignedOut } from "@clerk/nextjs"
import { UserMenu } from "./user-menu"
import { SignInMenu } from "./sign-in-menu"
import { NotificationDropdown } from "./notification-dropdown"
import { BallBalance } from "./ball-balance"
import { GoldBalance } from "./gold-balance"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

interface SearchResultPost {
  id: string
  title: string
  community_slug: string
  user_id: string
  created_at: string
}

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = searchParams.get("view")
  const isFeed = pathname === "/" && view !== "prediction"
  const isExplore = pathname.startsWith("/explore") || pathname.startsWith("/community")
  const isPrediction = pathname === "/" && view === "prediction"

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResultPost[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchedOnce, setSearchedOnce] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const runSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setDropdownOpen(false)
      setSearchedOnce(false)
      return
    }
    setSearchLoading(true)
    setDropdownOpen(true)
    setSearchedOnce(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=title_content&limit=8`)
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
  }, [searchQuery])

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const q = searchQuery.trim()
      if (q) {
        setDropdownOpen(false)
        router.push(`/search?q=${encodeURIComponent(q)}&type=title_content`)
      }
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header className="border-border bg-card/95 sticky top-0 z-50 w-full border-b backdrop-blur-md">
      {/* Threads 스타일: 충분한 높이, 명확한 구조 */}
      <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
        {/* 높이 56px: Threads 스타일 - 여유있는 헤더 */}
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Logo: 왼쪽 정렬 */}
          <div className="-ml-[25px] flex min-w-0 shrink-0 items-center justify-start gap-2 sm:gap-3">
            <Link
              href="/"
              onClick={(e) => {
                // 같은 페이지(홈)에서 로고 클릭 시 Next.js 소프트 내비게이션을 막아
                // <main tabIndex={-1}> 자동 포커스로 인한 스크롤 오프셋 방지
                if (window.location.pathname === "/" && !window.location.search) {
                  e.preventDefault()
                  window.scrollTo(0, 0)
                }
              }}
              className="relative ml-3 flex items-baseline"
              aria-label="홈"
            >
              {/* 그깟 공놀이 붓글씨 (뒤쪽 레이어) */}
              <span className="relative z-0 -ml-1 hidden h-8 w-auto shrink-0 sm:block" aria-hidden>
                <Image
                  src="/logo-brush.webp"
                  alt=""
                  width={120}
                  height={32}
                  className="h-8 w-auto object-contain object-left"
                  priority
                />
              </span>
              {/* gongnori.fan 텍스트가 붓글씨 오른쪽과 겹치게 */}
              <span
                className="text-foreground relative z-10 ml-1 text-[30px] leading-none sm:-ml-[4px]"
                style={{ letterSpacing: "-0.02em" }}
              >
                <span className="font-bold">gongnori</span>
                <span className="text-primary font-normal">.fan</span>
              </span>
            </Link>
          </div>

          {/* Search: 헤더 중앙 고정 */}
          <div className="relative hidden w-[min(100%,400px)] shrink-0 sm:block" ref={containerRef}>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder="검색..."
                aria-label="게시글 검색"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (!e.target.value.trim()) setDropdownOpen(false)
                }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchResults.length > 0 && setDropdownOpen(true)}
                className="bg-secondary text-foreground focus:ring-ring focus:border-border placeholder:text-muted-foreground h-9 w-full rounded-full border border-transparent pr-4 pl-9 text-[14px] focus:ring-2 focus:outline-none"
              />
              {searchLoading && (
                <Loader2 className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin" />
              )}
            </div>
            {/* 검색 결과 드롭다운 */}
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

          {/* 모바일 검색 아이콘 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full sm:hidden"
            aria-label="검색"
            onClick={() => router.push("/search")}
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>

          {/* Actions: 오른쪽 정렬 */}
          <div className="flex min-w-0 items-center justify-end gap-1">
            <SignedIn>
              <div className="flex items-center gap-2">
                <GoldBalance />
                <BallBalance />
              </div>
              <NotificationDropdown />
            </SignedIn>
            <SignedOut>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-label="알림"
              >
                <Bell className="h-[18px] w-[18px]" />
              </Button>
            </SignedOut>

            {/* Clerk Authentication: 로그인 전에는 로그인 드롭다운, 로그인 후에는 사용자 메뉴 */}
            <SignedOut>
              <SignInMenu />
            </SignedOut>

            <SignedIn>
              <UserMenu />
            </SignedIn>
          </div>
        </div>
      </div>

      {/* 메뉴바: 좌우 폭 끝까지 (담벼락, 운동장, 경기 예측) */}
      <nav
        className="border-primary/20 bg-primary grid w-full grid-cols-[1fr_auto_1fr] items-center border-t px-2 pt-2 pb-2"
        aria-label="주요 메뉴"
      >
        <div />
        <div className="flex items-center justify-center gap-1.5">
          <Link
            href="/"
            scroll={false}
            onClick={(e) => {
              e.preventDefault()
              if (window.location.pathname === "/") {
                window.scrollTo({ top: 0, behavior: "auto" })
              } else {
                router.push("/")
                window.scrollTo({ top: 0, behavior: "auto" })
              }
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 gap-2 rounded-md px-3 font-sans text-[14px] font-semibold tracking-tight whitespace-nowrap sm:gap-2.5 sm:px-5 sm:text-[15px] ${
                isFeed
                  ? "text-white hover:bg-white/10 hover:text-white"
                  : "text-white/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
              담벼락
            </Button>
          </Link>
          <Link href="/explore" prefetch={false}>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 gap-2 rounded-md px-3 font-sans text-[14px] font-semibold tracking-tight whitespace-nowrap sm:gap-2.5 sm:px-5 sm:text-[15px] ${
                isExplore
                  ? "text-white hover:bg-white/10 hover:text-white"
                  : "text-white/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Compass className="h-[18px] w-[18px] shrink-0" />
              운동장
            </Button>
          </Link>
          <Link href="/?view=prediction" prefetch={false}>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 gap-2 rounded-md px-3 font-sans text-[14px] font-semibold tracking-tight whitespace-nowrap sm:gap-2.5 sm:px-5 sm:text-[15px] ${
                isPrediction
                  ? "text-white hover:bg-white/10 hover:text-white"
                  : "text-white/90 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Trophy className="h-[18px] w-[18px] shrink-0" />
              경기 예측
            </Button>
          </Link>
        </div>
        <div />
      </nav>
    </header>
  )
}
