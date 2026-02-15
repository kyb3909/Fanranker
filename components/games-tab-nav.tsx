"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Trophy, Gamepad2 } from "lucide-react"

const tabs = [
  { href: "/games/prediction", icon: Trophy, label: "승부 예측" },
  { href: "/games/draft-game", icon: Gamepad2, label: "드래프트 게임" },
]

export function GamesTabNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
        <nav className="flex" aria-label="게임 탭">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
