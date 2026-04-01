"use client"

import { memo } from "react"
import Link from "@/components/ui/app-link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Compass, LayoutGrid, Trophy, Gamepad2, Sparkles, Landmark } from "lucide-react"

const activeClass =
  "font-semibold text-[#f8f8f8] after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[2px] after:bg-[#f8f8f8]/70"
const inactiveClass = "text-[#f8f8f8]/60 hover:text-[#f8f8f8]/80"
const baseClass =
  "relative inline-flex h-11 items-center gap-1.5 px-2.5 font-sans text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors sm:gap-2.5 sm:px-5 sm:text-[14px]"

export const HeaderNav = memo(function HeaderNav() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = searchParams.get("view")

  const isFeed = pathname === "/" && view !== "prediction"
  const isExplore = pathname.startsWith("/explore") || pathname.startsWith("/community")
  const isPrediction = pathname === "/" && view === "prediction"
  const isGames = pathname.startsWith("/games")
  const isStadium = pathname.startsWith("/stadium")
  const isShop = pathname.startsWith("/shop")

  return (
    <nav className="bg-primary w-full border-t border-white/10" aria-label="주요 메뉴">
      <div className="scrollbar-none flex items-center justify-center overflow-x-auto">
        <Link
          href="/"
          scroll={false}
          onClick={(e) => {
            e.preventDefault()
            if (window.location.pathname === "/" && !window.location.search) {
              window.scrollTo({ top: 0, behavior: "auto" })
            } else {
              router.push("/")
              window.scrollTo({ top: 0, behavior: "auto" })
            }
          }}
        >
          <span className={`${baseClass} ${isFeed ? activeClass : inactiveClass}`}>
            <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
            담벼락
          </span>
        </Link>
        <Link href="/explore">
          <span className={`${baseClass} ${isExplore ? activeClass : inactiveClass}`}>
            <Compass className="h-[18px] w-[18px] shrink-0" />
            운동장
          </span>
        </Link>
        <Link href="/?view=prediction">
          <span className={`${baseClass} ${isPrediction ? activeClass : inactiveClass}`}>
            <Trophy className="h-[18px] w-[18px] shrink-0" />
            경기 예측
          </span>
        </Link>
        <Link href="/stadium">
          <span className={`${baseClass} ${isStadium ? activeClass : inactiveClass}`}>
            <Landmark className="h-[18px] w-[18px] shrink-0" />
            스타디움
          </span>
        </Link>
        <Link href="/games">
          <span className={`${baseClass} ${isGames ? activeClass : inactiveClass}`}>
            <Gamepad2 className="h-[18px] w-[18px] shrink-0" />
            게임
          </span>
        </Link>
        <Link href="/shop">
          <span className={`${baseClass} ${isShop ? activeClass : inactiveClass}`}>
            <Sparkles className="h-[18px] w-[18px] shrink-0" />
            상점
          </span>
        </Link>
      </div>
    </nav>
  )
})
