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
    <header
      className="sticky top-0 z-50 w-full pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        borderBottom: "4px solid var(--wc-burgundy, #A0203B)",
        boxShadow: "0 1px 2px rgba(26, 20, 22, 0.04)",
      }}
    >
      <div className="mx-auto max-w-[1280px] px-3 sm:px-6 lg:px-10">
        {/*
          시안 .hdr-inner: grid-template-columns: auto auto 1fr auto (brand · nav · search · right).
          모바일/태블릿 (lg 이하)에서는 nav 숨기고 (모바일 탭바가 대신), grid 3-col.
        */}
        <div className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 lg:grid-cols-[auto_auto_1fr_auto] lg:gap-6">
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
              className="relative flex min-h-11 items-baseline"
              aria-label="홈"
            >
              <span className="relative z-0 -ml-1 hidden shrink-0 sm:block" aria-hidden>
                <Image src="/logo-brush.webp" alt="" width={128} height={38} priority />
              </span>
              <span
                className="relative z-10 ml-1 text-[20px] leading-none sm:-ml-[4px] sm:text-[26px] lg:text-[30px]"
                style={{ letterSpacing: "-0.02em", color: "var(--wc-ink, #1A1416)" }}
              >
                <span className="font-bold">gongnori</span>
                <span className="font-normal" style={{ color: "var(--wc-burgundy, #A0203B)" }}>
                  .fan
                </span>
              </span>
            </Link>
          </div>

          {/* Nav (데스크탑 lg 이상만 — 시안 .hdr-nav 인라인) */}
          <div className="hidden lg:flex">
            <HeaderNav inline />
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

      {/*
        모바일/태블릿 (lg 이하) 에서는 별도 row 로 nav 노출 — 월드컵/상점 등 lg에서만
        헤더 안 인라인 배치라 모바일에서 그 두 메뉴 접근 손실 방지. 시안 .hdr 패턴은
        데스크탑 한 행, 모바일은 stacked.
      */}
      <div className="lg:hidden">
        <HeaderNav />
      </div>
    </header>
  )
}
