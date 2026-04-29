"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import { Bell, Compass, LayoutGrid, Search, Sparkles, Trophy, type LucideIcon } from "lucide-react"
import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { GoldBalance } from "@/components/header/gold-balance"
import { BallBalance } from "@/components/header/ball-balance"
import { NotificationDropdown } from "@/components/header/notification-dropdown"
import { UserMenu } from "@/components/header/user-menu"
import { SignInMenu } from "@/components/header/sign-in-menu"

const NAV_ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "담벼락", href: "/", icon: LayoutGrid },
  { label: "운동장", href: "/explore", icon: Compass },
  { label: "경기 예측", href: "/prediction", icon: Trophy },
  { label: "상점", href: "/shop", icon: Sparkles },
]

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
  const { openSignIn } = useClerk()

  return (
    <div>
      {/* Row 1 — 로고 + 검색 + actions (흰 배경, 헤더 backdrop-blur 그대로 통과). */}
      <div className="mx-auto grid h-14 w-full max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-6 lg:h-16 lg:px-8">
        {/* 로고 — 원본 디자인 그대로 (브러시 좌측 + .fan 포인트색) */}
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

        {/* 가운데: lg+에서 검색 / 모바일은 비움(검색은 우측 cluster에 합류) */}
        <div className="hidden justify-center lg:flex">
          <TopbarSearch variant="center" />
        </div>
        <div className="lg:hidden" />

        {/* 우측 actions */}
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          {/* 모바일: 검색 아이콘 inline (lg+에서 가운데로 이전) */}
          <div className="lg:hidden">
            <TopbarSearch variant="mobile-only" />
          </div>

          <SignedIn>
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

      {/* Row 2 — 풀폭 burgundy 띠 nav. 모바일에서도 노출 (production과 동일).
          모바일 tab-bar는 page 하단 fixed로 별도 작동. */}
      <div style={{ backgroundColor: "var(--ms-brand)" }}>
        <div className="mx-auto flex h-12 w-full max-w-[1280px] items-stretch justify-center gap-0 px-2 sm:gap-1 sm:px-6 lg:px-8">
          <nav
            className="flex flex-1 items-stretch justify-around sm:flex-initial sm:gap-1"
            aria-label="주요 메뉴"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = item.label === active
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex items-center justify-center gap-1 px-2 text-[13px] tracking-tight transition-colors sm:gap-1.5 sm:px-5 sm:text-[15px]"
                  style={{
                    color: isActive ? "#ffffff" : "rgba(255,255,255,0.65)",
                    fontWeight: isActive ? 800 : 600,
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" aria-hidden />
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute right-2 -bottom-px left-2 h-[3px] rounded-full bg-white"
                    />
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}

/**
 * 검색 — variant로 컨텍스트별 위치 분리.
 * - "center": lg+ Row 1 가운데 큰 pill input
 * - "mobile-only": 모바일에서 우측 actions에 합류하는 아이콘 + 토글 폼
 * 둘 다 native form submit으로 /search?q=... 이동.
 */
function TopbarSearch({ variant }: { variant: "center" | "mobile-only" }) {
  const [query, setQuery] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus()
  }, [mobileOpen])

  const handleSubmit = (e: FormEvent) => {
    const trimmed = query.trim()
    if (!trimmed) {
      e.preventDefault()
      return
    }
  }

  if (variant === "center") {
    return (
      <form action="/search" method="get" onSubmit={handleSubmit} role="search">
        <label className="flex h-10 w-[420px] items-center gap-2 rounded-full border border-[var(--ms-line)] bg-[var(--ms-bg-hover)] px-5 text-[13px] transition-colors focus-within:border-[var(--ms-line-hover)]">
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--ms-ink-3)" }} />
          <input
            type="text"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색..."
            className="min-w-0 flex-1 bg-transparent text-[var(--ms-ink)] placeholder:text-[var(--ms-ink-3)] focus:outline-none"
            aria-label="검색"
          />
        </label>
      </form>
    )
  }

  // mobile-only
  return !mobileOpen ? (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ms-ink-3)] transition-colors hover:bg-[var(--ms-bg-hover)]"
      aria-label="검색"
    >
      <Search className="h-[18px] w-[18px]" />
    </button>
  ) : (
    <form action="/search" method="get" onSubmit={handleSubmit} role="search" className="flex">
      <label className="flex h-9 items-center gap-2 rounded-full border border-[var(--ms-line)] bg-[var(--ms-bg-hover)] px-3 text-[13px] focus-within:border-[var(--ms-line-hover)]">
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--ms-ink-3)" }} />
        <input
          ref={mobileInputRef}
          type="text"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => {
            if (!query.trim()) setMobileOpen(false)
          }}
          placeholder="검색"
          className="w-32 min-w-0 bg-transparent text-[var(--ms-ink)] placeholder:text-[var(--ms-ink-3)] focus:outline-none"
          aria-label="검색"
        />
      </label>
    </form>
  )
}
