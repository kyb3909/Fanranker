'use client'

import { Button } from "@/components/ui/button"
import { Home, Compass, Bell, User, Search } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, KeyboardEvent } from "react"
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { UserMenu } from './user-menu'
import { SignInMenu } from './sign-in-menu'
import { NotificationDropdown } from './notification-dropdown'
import { BallBalance } from './ball-balance'

export function Header() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")

  const handleSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault()
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}&type=title_content`)
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur-md">
      {/* Threads 스타일: 충분한 높이, 명확한 구조 */}
      <div className="mx-auto px-4 sm:px-6 max-w-[1280px]">
        {/* 높이 56px: Threads 스타일 - 여유있는 헤더 */}
        <div className="flex h-14 items-center justify-between">

          {/* Logo & Navigation */}
          <div className="flex items-center gap-6">
            <Link href="/">
              <h1 className="text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors">
                홈
              </h1>
            </Link>

            {/* Navigation: Threads 스타일 */}
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2 h-9 px-4 text-[14px] font-medium">
                  <Home className="h-4 w-4" />
                  피드
                </Button>
              </Link>
              <Link href="/explore">
                <Button variant="ghost" size="sm" className="gap-2 h-9 px-4 text-[14px] font-medium">
                  <Compass className="h-4 w-4" />
                  탐색
                </Button>
              </Link>
            </nav>
          </div>

          {/* Search: Threads 스타일 */}
          <div className="hidden sm:flex flex-1 max-w-sm lg:max-w-md mx-6">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                onClick={() => router.push('/search')}
                className="w-full h-9 pl-10 pr-4 bg-secondary text-[14px] text-foreground rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground cursor-pointer"
              />
            </div>
          </div>

          {/* Actions: 여유있는 간격 */}
          <div className="flex items-center gap-1">
            <SignedIn>
              <BallBalance />
              <NotificationDropdown />
            </SignedIn>
            <SignedOut>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
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
    </header>
  )
}
