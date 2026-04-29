"use client"

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
 * Minimal Sport Topbar — 64px 높이, 1280px 그리드.
 *
 * 좌: 28px 원형 마크 + "gongnori.fan" (점만 brand)
 * 중: 4 nav pill (활성 검정 배경 + 흰 텍스트)
 * 우(SignedIn): 검색 pill / GoldBalance / BallBalance / NotificationDropdown / UserMenu
 * 우(SignedOut): 검색 pill / Bell(클릭 시 sign-in) / SignInMenu
 *
 * 모든 우측 컴포넌트는 기존 Header에서 사용하던 client component 그대로 재사용 —
 * 실데이터(Clerk 세션, 골드/볼 SWR fetch, 알림 list)에 자동 연결됨.
 */
export function MinimalTopbar({ active }: MinimalTopbarProps) {
  const router = useRouter()
  const { openSignIn } = useClerk()

  return (
    <div className="grid h-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:px-8">
      {/* 로고 */}
      <Link href="/" className="flex items-center gap-2" aria-label="홈">
        <span
          className="inline-block h-6 w-6 rounded-full lg:h-7 lg:w-7"
          style={{ backgroundColor: "var(--ms-brand)" }}
          aria-hidden
        />
        <span
          className="text-[15px] leading-none font-extrabold sm:text-[18px]"
          style={{ letterSpacing: "-0.03em" }}
        >
          gongnori
          <span style={{ color: "var(--ms-brand)" }}>.</span>
          fan
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
                  ? "bg-[var(--ms-ink)] text-white"
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
