"use client"

import Image from "next/image"
import Link from "@/components/ui/app-link"
import { useRouter } from "next/navigation"
import { Bell, Search } from "lucide-react"
import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { GoldBalance } from "@/components/header/gold-balance"
import { BallBalance } from "@/components/header/ball-balance"
import { NotificationDropdown } from "@/components/header/notification-dropdown"
import { UserMenu } from "@/components/header/user-menu"
import { SignInMenu } from "@/components/header/sign-in-menu"

const NAV_ITEMS = [
  { label: "담벼락", href: "/" },
  { label: "운동장", href: "/explore" },
  { label: "경기 예측", href: "/prediction" },
  { label: "상점", href: "/shop" },
] as const

interface MinimalTopbarProps {
  active: "담벼락" | "운동장" | "경기 예측" | "상점"
}

/**
 * Minimal Sport Topbar — 56px(mobile) / 64px(lg+) 높이, 1280px 그리드.
 *
 * 좌(로고): "그깟 공놀이" 브러시 캘리그래피(sm+) 위로 baseline 정렬된 "gongnori.fan" 텍스트.
 *           gongnori = font-bold ink, .fan = font-normal brand. 모바일은 텍스트만.
 * 중: 4 nav pill (활성 검정 배경 + 흰 텍스트). 모바일은 mobile-tab-bar로 nav.
 * 우(SignedIn): 검색 / GoldBalance / BallBalance / NotificationDropdown / UserMenu
 * 우(SignedOut): 검색 / Bell(→ sign-in) / SignInMenu
 *
 * 우측 컴포넌트는 기존 Header에서 그대로 재사용 (실데이터 자동 연결).
 */
export function MinimalTopbar({ active }: MinimalTopbarProps) {
  const router = useRouter()
  const { openSignIn } = useClerk()

  return (
    <div className="grid h-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
      {/* 로고 — 원본 디자인 그대로 (브러시 좌측 + .fan 포인트색). */}
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
          className="relative z-10 ml-1 text-[20px] leading-none sm:-ml-[4px] sm:text-[30px]"
          style={{ letterSpacing: "-0.02em", color: "var(--ms-ink)" }}
        >
          <span className="font-bold">gongnori</span>
          <span className="font-normal" style={{ color: "var(--ms-brand)" }}>
            .fan
          </span>
        </span>
      </Link>

      {/* Nav — 데스크톱(lg+)만. 모바일은 mobile-tab-bar로 nav. */}
      <nav className="hidden items-center gap-1 lg:flex">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === active
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-[14px] py-2 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--ms-brand)] text-white shadow-sm"
                  : "text-[var(--ms-ink)] hover:bg-[var(--ms-bg-hover)]"
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      {/* 모바일: nav 자리 채움 */}
      <div className="lg:hidden" />

      {/* 우측 actions — 기존 Header 컴포넌트 재사용 (실데이터 자동 연결) */}
      <div className="flex items-center justify-end gap-1 sm:gap-2">
        {/* 검색 — 모바일은 아이콘만, 데스크톱은 pill */}
        <button
          type="button"
          onClick={() => router.push("/search")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ms-ink-3)] transition-colors hover:bg-[var(--ms-bg-hover)] lg:hidden"
          aria-label="검색"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => router.push("/search")}
          className="hidden h-9 w-[220px] items-center gap-2 rounded-full border border-[var(--ms-line)] bg-[var(--ms-bg-hover)] px-4 text-[12px] text-[var(--ms-ink-3)] transition-colors hover:border-[var(--ms-line-hover)] lg:flex"
          aria-label="검색"
        >
          <Search className="h-4 w-4" />
          검색하기
        </button>

        <SignedIn>
          {/* 잔액은 데스크톱에서만 — 모바일은 user menu에서 확인. */}
          <div className="hidden items-center gap-2 sm:flex">
            <GoldBalance />
            <BallBalance />
          </div>
          <NotificationDropdown />
          <UserMenu />
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
          <SignInMenu />
        </SignedOut>
      </div>
    </div>
  )
}
