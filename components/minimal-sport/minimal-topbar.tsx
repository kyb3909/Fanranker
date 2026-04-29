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

      {/* Nav — 데스크톱(lg+)만. 모바일은 mobile-tab-bar로 nav.
          탭 스타일: 활성 텍스트 ink + 하단 brand underline. underline은 헤더 하단
          border와 정확히 일치 → 탭이 헤더에 박혀있는 접지감. */}
      <nav className="hidden h-full items-stretch gap-2 lg:flex">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === active
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-1.5 px-4 text-[15px] tracking-tight transition-colors hover:bg-[var(--ms-bg-hover)]"
              style={{
                color: isActive ? "var(--ms-ink)" : "var(--ms-ink-3)",
                fontWeight: isActive ? 800 : 600,
              }}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {item.label}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute right-0 -bottom-px left-0 h-[3px]"
                  style={{ backgroundColor: "var(--ms-brand)" }}
                />
              )}
            </Link>
          )
        })}
      </nav>
      {/* 모바일: nav 자리 채움 */}
      <div className="lg:hidden" />

      {/* 우측 actions — 기존 Header 컴포넌트 재사용 (실데이터 자동 연결) */}
      <div className="flex items-center justify-end gap-1 sm:gap-2">
        <TopbarSearch />

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

/**
 * 검색 — 데스크톱은 inline pill input, 모바일은 아이콘 → 풀폭 input 토글.
 * 둘 다 native form submit으로 /search?q=... 이동. JS 비활성화돼도 동작.
 */
function TopbarSearch() {
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
    // form action="/search" + method="get" → 자동 query string 생성. 추가 처리 불필요.
  }

  return (
    <>
      {/* 데스크톱(lg+): 항상 보이는 pill input */}
      <form
        action="/search"
        method="get"
        onSubmit={handleSubmit}
        role="search"
        className="hidden lg:block"
      >
        <label className="flex h-9 w-[220px] items-center gap-2 rounded-full border border-[var(--ms-line)] bg-[var(--ms-bg-hover)] px-4 text-[12px] transition-colors focus-within:border-[var(--ms-line-hover)]">
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--ms-ink-3)" }} />
          <input
            type="text"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색하기"
            className="min-w-0 flex-1 bg-transparent text-[var(--ms-ink)] placeholder:text-[var(--ms-ink-3)] focus:outline-none"
            aria-label="검색"
          />
        </label>
      </form>

      {/* 모바일(<lg): 아이콘 → 클릭 시 input 확장 */}
      {!mobileOpen ? (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ms-ink-3)] transition-colors hover:bg-[var(--ms-bg-hover)] lg:hidden"
          aria-label="검색"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <form
          action="/search"
          method="get"
          onSubmit={handleSubmit}
          role="search"
          className="flex flex-1 lg:hidden"
        >
          <label className="flex h-9 flex-1 items-center gap-2 rounded-full border border-[var(--ms-line)] bg-[var(--ms-bg-hover)] px-3 text-[13px] focus-within:border-[var(--ms-line-hover)]">
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
              placeholder="검색하기"
              className="min-w-0 flex-1 bg-transparent text-[var(--ms-ink)] placeholder:text-[var(--ms-ink-3)] focus:outline-none"
              aria-label="검색"
            />
          </label>
        </form>
      )}
    </>
  )
}
