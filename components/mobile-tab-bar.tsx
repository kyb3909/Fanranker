"use client"

import { Suspense } from "react"
import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { Compass, Crown, LayoutGrid, User } from "lucide-react"

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
    // 경기 예측(/prediction)은 메뉴에서 숨기고 월드컵 이벤트로 대체 (라우트는 유지).
    href: "/worldcup",
    icon: Crown,
    label: "월드컵",
    match: (p: string) => p.startsWith("/worldcup"),
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
        borderTop: "1px solid var(--wc-line, #E2E5EA)",
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
