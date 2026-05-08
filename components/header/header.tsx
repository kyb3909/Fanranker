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
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {/*
          헤더 1행: brand · search · actions (단순 3-col).
          nav 는 별도 row (아래) — 메뉴 늘어날 때 공간 부족 + 로그인 시 잔액/알림/프로필
          과 겹침 방지.
        */}
        <div className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">
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
              className="relative -ml-1 flex min-h-11 items-baseline"
              aria-label="홈"
            >
              <span className="relative z-0 hidden shrink-0 sm:block" aria-hidden>
                <Image src="/logo-brush.webp" alt="" width={112} height={33} priority />
              </span>
              <span
                className="relative z-10 ml-0.5 text-[19px] leading-none sm:-ml-[4px] sm:text-[24px] lg:text-[26px]"
                style={{ letterSpacing: "-0.02em", color: "var(--wc-ink, #1A1416)" }}
              >
                <span className="font-bold">gongnori</span>
                <span className="font-normal" style={{ color: "var(--wc-burgundy, #A0203B)" }}>
                  .fan
                </span>
              </span>
            </Link>
          </div>

          {/* 우측 그룹 — search + actions 동거 (3-col 의 마지막 auto cell) */}
          <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
            {/* 검색창 (sm 이상) — lg col-3 폭 안에 들어가도록 max-w 제한 */}
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

      {/* 헤더 2행: nav — 모든 viewport에서 별도 row (메뉴 공간 확보 + 로그인 시 우측 영역 겹침 방지) */}
      <HeaderNav />
    </header>
  )
}
