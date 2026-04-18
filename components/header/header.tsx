"use client"

import { Button } from "@/components/ui/button"
import { Bell, Search } from "lucide-react"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs"
import { UserMenu } from "./user-menu"
import { SignInMenu } from "./sign-in-menu"
import { NotificationDropdown } from "./notification-dropdown"
import { BallBalance } from "./ball-balance"
import { GoldBalance } from "./gold-balance"
import { HeaderSearch } from "./header-search"
import { HeaderNav } from "./header-nav"

export function Header() {
  const router = useRouter()
  const { openSignIn } = useClerk()

  return (
    <header className="border-border sticky top-0 z-50 w-full border-b bg-white/85 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl">
      <div className="mx-auto max-w-[1280px] px-3 sm:px-10">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Logo */}
          <div className="flex min-w-0 items-center justify-start">
            <Link
              href="/"
              onClick={(e) => {
                if (window.location.pathname === "/" && !window.location.search) {
                  e.preventDefault()
                  window.scrollTo(0, 0)
                }
              }}
              className="relative flex items-baseline"
              aria-label="홈"
            >
              <span className="relative z-0 -ml-1 hidden shrink-0 sm:block" aria-hidden>
                <Image src="/logo-brush.webp" alt="" width={128} height={38} priority />
              </span>
              <span
                className="text-foreground relative z-10 ml-1 text-[20px] leading-none sm:-ml-[4px] sm:text-[30px]"
                style={{ letterSpacing: "-0.02em" }}
              >
                <span className="font-bold">gongnori</span>
                <span className="text-primary font-normal">.fan</span>
              </span>
            </Link>
          </div>

          {/* Search: 검색 state가 격리되어 타이핑 시 나머지 헤더 리렌더 없음 */}
          <HeaderSearch />

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

          {/* Actions */}
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
                onClick={() => openSignIn()}
              >
                <Bell className="h-[18px] w-[18px]" />
              </Button>
            </SignedOut>

            <SignedOut>
              <SignInMenu />
            </SignedOut>

            <SignedIn>
              <UserMenu />
            </SignedIn>
          </div>
        </div>
      </div>

      {/* Nav: pathname 변경 시에만 리렌더, 검색과 무관 */}
      <HeaderNav />
    </header>
  )
}
