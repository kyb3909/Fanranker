"use client"

import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { ListOrdered } from "lucide-react"

// Phase 2 절제: 갈드컵은 삭제, 이상형 월드컵은 notFound 숨김 (컴포넌트 보존).
// 재오픈 시 app/games/worldcup/page.tsx 원복 + 여기 entry 추가.
const games = [{ href: "/games/draft", icon: ListOrdered, label: "드래프트 게임" }]

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
