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
          페이지 12-col grid (3-6-3) 와 align — 1번 영역(좌 사이드바 폭)에 brand,
          2번 영역(메인 col-span-6)에 nav 중앙 정렬, 3번 영역(우 사이드바 폭)에 search + actions.

          모바일/태블릿 (lg 이하): 3-col [auto 1fr auto] + nav 별도 row.
        */}
        <div className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4 lg:grid-cols-12 lg:gap-6">
          {/* Logo — lg 에서 col-span-3 (좌 사이드바 폭) */}
          <div className="flex min-w-0 items-center justify-start lg:col-span-3">
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

          {/* Nav — lg 에서 col-span-6 (메인 영역) 중앙 정렬 */}
          <div className="hidden lg:col-span-6 lg:flex lg:items-center lg:justify-center">
            <HeaderNav inline />
          </div>

          {/*
            우측 그룹 — lg에서 col-span-3 (우 사이드바 폭) 안에 search + actions 동거.
            lg 미만에서는 grid 3-col 의 마지막 auto cell 차지.
          */}
          <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2 lg:col-span-3">
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
