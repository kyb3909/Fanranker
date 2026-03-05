"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Trophy } from "lucide-react"

const games = [
  {
    href: "/games/prediction",
    icon: Trophy,
    label: "경기 예측",
    description: "프로토 경기 결과를 예측하세요",
    color: "from-amber-500 to-orange-500",
    bgLight: "bg-amber-50",
    borderActive: "ring-amber-500/50",
    iconBg: "bg-amber-500/10 text-amber-600",
  },
  // TODO: 기획 완성 후 활성화
  // {
  //   href: "/games/draft",
  //   icon: Users,
  //   label: "드래프트",
  //   description: "친구와 실시간 선수 드래프트",
  //   color: "from-violet-500 to-purple-600",
  //   bgLight: "bg-violet-50",
  //   borderActive: "ring-violet-500/50",
  //   iconBg: "bg-violet-500/10 text-violet-600",
  // },
]

export function GamesTabNav() {
  const pathname = usePathname()

  return (
    <div className="bg-card border-border border-b">
      <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
