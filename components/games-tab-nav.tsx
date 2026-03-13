"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Flame, Trophy, ListOrdered } from "lucide-react"

const games = [
  { href: "/games/galcup", icon: Flame, label: "갈드컵" },
  { href: "/games/worldcup", icon: Trophy, label: "이상형 월드컵" },
  { href: "/games/draft", icon: ListOrdered, label: "드래프트 게임" },
]

export function GamesTabNav() {
  const pathname = usePathname()

  return (
    <div className="border-border mb-5 flex gap-1 border-b">
      {games.map((game) => {
        const isActive = pathname.startsWith(game.href)
        return (
          <Link
            key={game.href}
            href={game.href}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              isActive
                ? "text-primary after:bg-primary font-semibold after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[2px]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <game.icon className="h-4 w-4" />
            {game.label}
          </Link>
        )
      })}
    </div>
  )
}
