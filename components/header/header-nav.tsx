"use client"

import { memo } from "react"
import Link from "@/components/ui/app-link"
import { useRouter, usePathname } from "next/navigation"
import { Compass, LayoutGrid, Trophy, Crown, Gamepad2 } from "lucide-react"

// 시안 .hdr-link 패턴 — 흰 배경 nav, off=mute, on=burgundy fill.
// scope-free 하게 var(--wc-*) + hex fallback 사용 → AppShell 어디서나 동작.
const baseClass =
  "wc-hdr-link relative inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 font-sans text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors sm:gap-1.5 sm:px-3 sm:text-[14px]"

interface HeaderNavProps {
  /**
   * inline=true: 헤더 한 행 안에 인라인 배치 (시안 .hdr-nav).
   * inline=false (default): 헤더 아래 별도 row (외곽 흰 카드 + top border).
   */
  inline?: boolean
}

export const HeaderNav = memo(function HeaderNav({ inline = false }: HeaderNavProps) {
  const router = useRouter()
  const pathname = usePathname()

  const isFeed = pathname === "/"
  const isExplore = pathname.startsWith("/explore") || pathname.startsWith("/community")
  const isPrediction = pathname.startsWith("/prediction")
  const isWorldcup = pathname.startsWith("/worldcup")
  const isGames = pathname.startsWith("/games")

  return (
    <nav
      className={inline ? "flex items-center" : "w-full"}
      aria-label="주요 메뉴"
      style={
        inline
          ? undefined
          : {
              background: "var(--wc-card, #ffffff)",
              borderTop: "1px solid var(--wc-line, #efe7e0)",
            }
      }
    >
      <div
        className={
          inline
            ? "scrollbar-none flex items-center gap-0.5 overflow-x-auto"
            : "scrollbar-none flex items-center justify-center overflow-x-auto"
        }
      >
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
          <span className={baseClass} data-on={isFeed ? "true" : undefined}>
            <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
            담벼락
          </span>
        </Link>
        <Link href="/explore">
          <span className={baseClass} data-on={isExplore ? "true" : undefined}>
            <Compass className="h-[18px] w-[18px] shrink-0" />
            운동장
          </span>
        </Link>
        <Link href="/prediction">
          <span className={baseClass} data-on={isPrediction ? "true" : undefined}>
            <Trophy className="h-[18px] w-[18px] shrink-0" />
            경기 예측
          </span>
        </Link>
        <Link href="/worldcup">
          <span className={baseClass} data-on={isWorldcup ? "true" : undefined}>
            <Crown className="h-[18px] w-[18px] shrink-0" />
            월드컵 이벤트
            <span
              aria-hidden
              className="wc-hdr-pulse ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            />
          </span>
        </Link>
        <Link href="/games/draft">
          <span className={baseClass} data-on={isGames ? "true" : undefined}>
            <Gamepad2 className="h-[18px] w-[18px] shrink-0" />
            게임
            <span aria-hidden className="ml-0.5 text-[10px] font-normal tracking-normal opacity-60">
              (test)
            </span>
          </span>
        </Link>
        {/*
          스타디움 메뉴는 가오픈에서 제외 (스프라이트 외주 + Phaser 작업 완료 후 노출).
          라우트(/stadium/*)는 유지 — 직접 URL로만 접근 가능.
          상점은 UserMenu (프로필 드롭다운) 으로 이동 — 메뉴바 컴팩트화.
        */}
      </div>
    </nav>
  )
})
