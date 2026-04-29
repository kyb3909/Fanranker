"use client"

import Link from "@/components/ui/app-link"
import { useUser } from "@clerk/nextjs"
import { Search } from "lucide-react"
import { useRouter } from "next/navigation"

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
 * Minimal Sport Topbar — 64px 높이, 1280px 그리드 안에서 좌·중·우 3분할.
 *
 * - 좌: 28px 원형 마크(버건디) + "gongnori.fan" 텍스트 (점만 버건디)
 * - 중: 4개 nav 버튼 (활성 시 검정 배경 흰 글씨, pill)
 * - 우: 검색 pill, 골드/볼 코인 pill, 32px 아바타
 */
export function MinimalTopbar({ active }: MinimalTopbarProps) {
  const router = useRouter()
  const { user, isSignedIn } = useUser()

  const initial = user?.firstName?.[0] ?? user?.username?.[0] ?? "K"

  return (
    <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center px-8">
      {/* 로고 */}
      <Link href="/" className="flex items-center gap-2" aria-label="홈">
        <span
          className="inline-block h-7 w-7 rounded-full"
          style={{ backgroundColor: "var(--ms-brand)" }}
          aria-hidden
        />
        <span
          className="text-[18px] leading-none font-extrabold"
          style={{ letterSpacing: "-0.03em" }}
        >
          gongnori
          <span style={{ color: "var(--ms-brand)" }}>.</span>
          fan
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === active
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-[14px] py-2 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--ms-ink)] text-white"
                  : "text-[var(--ms-ink)] hover:bg-[var(--ms-bg)]"
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* 우측: 검색 + 코인 + 아바타 */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/search")}
          className="flex h-9 w-[220px] items-center gap-2 rounded-full border border-[var(--ms-line)] bg-[var(--ms-bg)] px-4 text-[12px] text-[var(--ms-ink-3)] transition-colors hover:border-[var(--ms-line-hover)]"
          aria-label="검색"
        >
          <Search className="h-4 w-4" />
          검색하기
        </button>
        <span
          className="font-archivo flex h-9 items-center rounded-full px-3 text-[12px] font-bold"
          style={{
            background: "var(--ms-brand-soft)",
            color: "var(--ms-brand)",
          }}
        >
          ●&nbsp;0
        </span>
        <span
          className="font-archivo flex h-9 items-center rounded-full px-3 text-[12px] font-bold text-white"
          style={{ background: "var(--ms-brand)" }}
        >
          ●&nbsp;{isSignedIn ? "10" : "0"}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: "var(--ms-brand)" }}
          aria-label="프로필"
        >
          {initial.toUpperCase()}
        </div>
      </div>
    </div>
  )
}
