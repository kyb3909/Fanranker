"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Compass, LayoutGrid, Trophy, User } from "lucide-react"

const tabs = [
  {
    href: "/",
    icon: LayoutGrid,
    label: "담벼락",
    match: (p: string, view?: string | null) => p === "/" && view !== "prediction",
  },
  {
    href: "/explore",
    icon: Compass,
    label: "운동장",
    match: (p: string) => p.startsWith("/explore") || p.startsWith("/community"),
  },
  {
    href: "/?view=prediction",
    icon: Trophy,
    label: "경기 예측",
    match: (p: string, view?: string | null) => p === "/" && view === "prediction",
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
  const searchParams = useSearchParams()
  const view = searchParams.get("view")

  return (
    <nav
      className="bg-card border-border fixed right-0 bottom-0 left-0 z-50 border-t sm:hidden"
      aria-label="모바일 메뉴"
    >
      <div className="flex h-14 items-center justify-around px-2">
        {tabs.map((tab) => {
          const isActive = tab.match(pathname, view)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="font-sans text-[10px] font-medium tracking-tight">{tab.label}</span>
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
