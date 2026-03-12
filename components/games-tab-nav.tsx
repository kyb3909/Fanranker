"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Flame, Trophy, ListOrdered } from "lucide-react"

const games = [
  {
    href: "/games/galcup",
    icon: Flame,
    label: "갈드컵",
    description: "댓글로 투표하는 응원 대결",
    color: "from-orange-500 to-red-500",
    bgLight: "bg-orange-50",
    borderActive: "ring-orange-500/50",
    iconBg: "bg-orange-500/10 text-orange-600",
  },
  {
    href: "/games/worldcup",
    icon: Trophy,
    label: "이상형 월드컵",
    description: "토너먼트로 최강자를 가려라",
    color: "from-violet-500 to-purple-500",
    bgLight: "bg-violet-50",
    borderActive: "ring-violet-500/50",
    iconBg: "bg-violet-500/10 text-violet-600",
  },
  {
    href: "/games/draft",
    icon: ListOrdered,
    label: "드래프트 게임",
    description: "스네이크 드래프트로 팀 짜기",
    color: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50",
    borderActive: "ring-emerald-500/50",
    iconBg: "bg-emerald-500/10 text-emerald-600",
  },
]

export function GamesTabNav() {
  const pathname = usePathname()

  return (
    <div className="bg-card border-border border-b">
      <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6">
        <div className="grid grid-cols-3 gap-3">
          {games.map((game) => {
            const isActive = pathname.startsWith(game.href)
            return (
              <Link
                key={game.href}
                href={game.href}
                className={`group relative flex flex-col items-center gap-2.5 rounded-xl p-4 transition-all duration-200 ${
                  isActive
                    ? `${game.bgLight} ring-2 ${game.borderActive} shadow-sm`
                    : "bg-muted/40 hover:bg-muted/70 ring-border hover:ring-border/80 ring-1"
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
                    className={`text-sm leading-tight font-semibold ${
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {game.label}
                  </p>
                  <p className="text-muted-foreground mt-0.5 hidden text-[11px] leading-tight sm:block">
                    {game.description}
                  </p>
                </div>

                {/* Active indicator dot */}
                {isActive && (
                  <div
                    className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-gradient-to-br ${game.color} ring-card ring-2`}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
