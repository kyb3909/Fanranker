"use client"

import { Suspense } from "react"
import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { Compass, LayoutGrid, Sparkles, Target, User } from "lucide-react"

const tabs = [
  {
    href: "/",
    icon: LayoutGrid,
    label: "담벼락",
    match: (p: string) => p === "/",
  },
  {
    href: "/explore",
    icon: Compass,
    label: "운동장",
    match: (p: string) => p.startsWith("/explore") || p.startsWith("/community"),
  },
  {
    // 승부예측 → 이벤트 페이지 (2026-08-14, GNB 와 같은 이유: 예측이 이벤트 전용이라
    // 규칙·참가를 먼저 보여주고 넘긴다). match 는 예측 화면에서도 이 탭이 켜지게 유지.
    href: "/season",
    icon: Target,
    label: "승부예측",
    match: (p: string) =>
      p.startsWith("/prediction") || p.startsWith("/worldcup") || p.startsWith("/season"),
  },
  {
    // 축구 타로 — 재미 콘텐츠. 승부예측 뒤에 둔다(예측과 붙으면 "점으로 고른다"로 읽힘).
    href: "/tarot",
    icon: Sparkles,
    label: "타로",
    match: (p: string) => p.startsWith("/tarot"),
  },
  {
    href: "/settings",
    icon: User,
    label: "마이",
    match: (p: string) =>
      p.startsWith("/settings") || p.startsWith("/profile") || p.startsWith("/my-"),
  },
]

function MobileTabBarContent() {
  const pathname = usePathname()

  if (pathname.startsWith("/admin")) return null
  // 메타버스는 홈페이지 서비스의 일부 — 모바일 탭바 유지해 다른 섹션 이동 가능.
  // Phaser canvas 는 /metaverse 페이지 내부에서 safe-area + tab bar 높이만큼 뺀
  // viewport 사용 (아래 app/metaverse/*/page 참고).

  return (
    <nav
      className="safe-area-pb fixed right-0 bottom-0 left-0 z-50 backdrop-blur-xl sm:hidden"
      aria-label="모바일 메뉴"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        borderTop: "1px solid var(--wc-line, #e8e5e0)",
        boxShadow: "0 -4px 12px rgba(26, 20, 22, 0.05)",
      }}
    >
      <div className="flex h-14 items-center justify-around px-2">
        {tabs.map((tab) => {
          const isActive = tab.match(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex min-h-[48px] min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 transition-colors"
              style={{
                color: isActive ? "var(--wc-burgundy, #961E37)" : "var(--wc-mute, #5C6470)",
              }}
            >
              <tab.icon className={`h-[22px] w-[22px] ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="font-sans text-[11px] font-medium tracking-tight">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function MobileTabBar() {
  return (
    <Suspense fallback={null}>
      <MobileTabBarContent />
    </Suspense>
  )
}
