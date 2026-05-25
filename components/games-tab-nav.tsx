"use client"

import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { Trophy, ListOrdered } from "lucide-react"

// 갈드컵은 메뉴에서 일단 숨김 — 페이지 코드(app/games/galcup, components/galcup/*)는
// 유지하고 URL 직접 접근만 가능. 향후 재오픈 검토 시 아래 entry 복원하고 Flame icon
// import 다시 추가.
const games = [
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
