"use client"

import { Button } from "@/components/ui/button"
import { Bell, Search } from "lucide-react"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs"
import { UserMenu } from "./user-menu"
import { SignInMenu } from "./sign-in-menu"
import { NotificationDropdown } from "./notification-dropdown"
import { BallBalance } from "./ball-balance"
// 골드 경제 잠시 숨김 (launch): import { GoldBalance } from "./gold-balance"
import { HeaderSearch } from "./header-search"
import { HeaderNav } from "./header-nav"

export function Header() {
  const router = useRouter()
  const { openSignIn } = useClerk()
  // 홈 리디자인 프리뷰는 같은 메뉴를 히어로 아래 Bridge 로 내려 붙였다 → 여기선 감춘다
  const hideNav = usePathname() === "/home-preview"

  return (
    <header
      className="sticky top-0 z-50 w-full pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        borderBottom: "1px solid #e8e5e0",
        boxShadow: "0 1px 3px rgba(30, 30, 50, 0.04)",
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
              {/* sm:h/w 명시 — 로고 이미지 디코드 전에도 슬롯 예약 → 데스크톱 헤더가 자라
                  본문(div.relative)을 미는 CLS(~0.024) 방지. 모바일은 hidden 이라 무관. */}
              <span
                className="relative z-0 hidden shrink-0 sm:block sm:h-[33px] sm:w-[112px]"
                aria-hidden
              >
                <Image src="/logo-brush.webp" alt="" width={112} height={33} priority />
              </span>
              <span
                className="relative z-10 ml-0.5 text-[19px] leading-none sm:-ml-[4px] sm:text-[24px] lg:text-[26px]"
                style={{ letterSpacing: "-0.02em", color: "var(--wc-ink, #1A1416)" }}
              >
                <span className="font-bold">gongnori</span>
                <span className="font-normal" style={{ color: "var(--wc-burgundy, #961E37)" }}>
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
                {/* 골드 잠시 숨김 (launch): <GoldBalance /> */}
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
        헤더 2행: nav — 모든 viewport에서 별도 row (메뉴 공간 확보 + 로그인 시 우측 영역 겹침 방지).

        ⚠️ `/home-preview` 에서만 감춘다 (2026-08-15 홈 리디자인 프리뷰). 그 페이지는 같은
        메뉴를 히어로 아래 Bridge 로 내려 붙여서, 여기까지 그리면 **같은 내비게이션이 두 줄**로
        보인다. 프리뷰 승인 전까지 프로덕션 경로는 전부 그대로다 — 이 조건 하나만 붙인다.
      */}
      {!hideNav && <HeaderNav />}
    </header>
  )
}
