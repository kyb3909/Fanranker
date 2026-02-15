"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Compass, Gamepad2, User } from "lucide-react"

const tabs = [
  { href: "/", icon: Home, label: "피드", match: (p: string) => p === "/" },
  { href: "/explore", icon: Compass, label: "탐색", match: (p: string) => p.startsWith("/explore") || p.startsWith("/community") },
  { href: "/games", icon: Gamepad2, label: "게임", match: (p: string) => p.startsWith("/games") },
  { href: "/settings", icon: User, label: "마이", match: (p: string) => p.startsWith("/settings") || p.startsWith("/profile") || p.startsWith("/my-") },
]

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-card border-t border-border" aria-label="모바일 메뉴">
      <div className="flex items-center justify-around h-14 px-2">
        {tabs.map((tab) => {
          const isActive = tab.match(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
