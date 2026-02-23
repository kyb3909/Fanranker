'use client'

import { Button } from "@/components/ui/button"
import { Home, Compass, Bell, Search, Palette, Loader2, Trophy, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react"
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { UserMenu } from './user-menu'
import { SignInMenu } from './sign-in-menu'
import { NotificationDropdown } from './notification-dropdown'
import { BallBalance } from './ball-balance'
import { GoldBalance } from './gold-balance'
import { IdentitySwitcher } from './identity-switcher'
import { IS_CULTURE } from '@/lib/site-config'
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
  const { theme, setTheme } = useTheme()

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
    if (e.key === 'Enter') {
      e.preventDefault()
      runSearch()
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur-md">
      {/* Threads 스타일: 충분한 높이, 명확한 구조 */}
      <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
        {/* 높이 56px: Threads 스타일 - 여유있는 헤더 */}
        <div className="flex h-14 items-center justify-between">

          {/* Logo */}
          <div className="flex items-center shrink-0">
            <Link href="/" className="flex items-center" aria-label="홈">
              <Image
                src="/logo.png"
                alt="FanRanker"
                width={120}
                height={32}
                className="h-8 w-auto object-contain"
                priority
              />
            </Link>
          </div>

          {/* Search: 좁은 폭, 헤더에서 바로 검색 */}
          <div className="hidden sm:block relative shrink-0 w-full max-w-[400px] min-w-0 mx-4" ref={containerRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
                className="w-full h-9 pl-9 pr-4 bg-secondary text-[14px] text-foreground rounded-full border border-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-border placeholder:text-muted-foreground"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none" />
              )}
            </div>
            {/* 검색 결과 드롭다운 */}
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {searchLoading ? '검색 중...' : searchedOnce && !searchLoading ? `${searchResults.length}개의 검색 결과` : ''}
            </div>
            {dropdownOpen && (searchLoading || searchResults.length > 0 || searchedOnce) && (
              <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[320px] overflow-y-auto" role="listbox" aria-label="검색 결과">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    검색 중...
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>
                ) : (
                  <>
                    {searchResults.map((post) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.id}`}
                        onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-2.5 hover:bg-muted/60 text-left"
                      >
                        <p className="text-[13px] font-medium text-foreground line-clamp-1">{post.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {COMMUNITY_NAMES[post.community_slug] || post.community_slug}
                        </p>
                      </Link>
                    ))}
                    <Link
                      href={`/search?q=${encodeURIComponent(searchQuery.trim())}&type=title_content`}
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2.5 text-center text-[13px] font-medium text-primary hover:bg-muted/60 border-t border-border"
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
            className="sm:hidden h-9 w-9 rounded-full"
            aria-label="검색"
            onClick={() => router.push('/search')}
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>

          {/* Actions: 여유있는 간격 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="테마 전환"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <SignedIn>
              <GoldBalance />
              <BallBalance />
              <NotificationDropdown />
            </SignedIn>
            <SignedOut>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="알림">
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

      {/* 메뉴바: 좌우 폭 끝까지 (피드, 탐색, 승부 예측) */}
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-primary/20 bg-primary px-2 pt-2 pb-1.5 w-full" aria-label="주요 메뉴">
        <div />
        <div className="flex items-center justify-center gap-1">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
              <Home className="h-4 w-4 text-white shrink-0" />
              피드
            </Button>
          </Link>
          <Link href="/explore">
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
              <Compass className="h-4 w-4 text-white shrink-0" />
              탐색
            </Button>
          </Link>
          {IS_CULTURE && (
            <Link href="/art">
              <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
                <Palette className="h-4 w-4 text-white shrink-0" />
                아트
              </Button>
            </Link>
          )}
          <Link href="/?view=prediction">
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
              <Trophy className="h-4 w-4 text-white shrink-0" />
              승부 예측
            </Button>
          </Link>
        </div>
        <div className="flex justify-end pr-1">
          <IdentitySwitcher />
        </div>
      </nav>
    </header>
  )
}
