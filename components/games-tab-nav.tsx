"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Trophy } from "lucide-react"

const games = [
  {
    href: "/games/prediction",
    icon: Trophy,
    label: "승부 예측",
    description: "프로토 경기 결과를 예측하세요",
    color: "from-amber-500 to-orange-500",
    bgLight: "bg-amber-50 dark:bg-amber-950/30",
    borderActive: "ring-amber-500/50",
    iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
]

export function GamesTabNav() {
  const pathname = usePathname()

  return (
    <div className="bg-card border-b border-border">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {games.map((game) => {
            const isActive = pathname.startsWith(game.href)
            return (
              <Link
                key={game.href}
                href={game.href}
                className={`group relative flex flex-col items-center gap-2.5 rounded-xl p-4 transition-all duration-200 ${
                  isActive
                    ? `${game.bgLight} ring-2 ${game.borderActive} shadow-sm`
                    : "bg-muted/40 hover:bg-muted/70 ring-1 ring-border hover:ring-border/80"
                }`}
              >
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? `bg-gradient-to-br ${game.color} text-white shadow-sm`
                      : `${game.iconBg} group-hover:scale-105`
                  }`}
                >
                  <game.icon className="h-5 w-5" />
                </div>

                {/* Text */}
                <div className="text-center">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {game.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">
                    {game.description}
                  </p>
                </div>

                {/* Active indicator dot */}
                {isActive && (
                  <div className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-gradient-to-br ${game.color} ring-2 ring-card`} />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
