"use client"

import type { ReactNode } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { useOnboardingGuard } from "@/hooks/use-onboarding-guard"

const AnnouncementCarousel = dynamic(
  () =>
    import("@/components/home/announcement-carousel").then((m) => ({
      default: m.AnnouncementCarousel,
    })),
  { ssr: false }
)

interface AppShellClientProps {
  header: ReactNode
  children: ReactNode
}

export function AppShellClient({ header, children }: AppShellClientProps) {
  const pathname = usePathname()
  // admin 은 완전히 자체 레이아웃 (헤더·탭바 전부 제거). 메타버스는 홈페이지
  // 서비스의 일부라 헤더·탭바 유지 — 단 배너는 메인 피드에서만.
  const hideChrome = pathname.startsWith("/admin")
  const isHome = pathname === "/"
  // Minimal Sport 디자인 페이지: 자체 Topbar가 모든 viewport에서 표시 →
  // 기존 Header를 항상 숨김 (충돌 회피). 5 페이지 + 게시판 전부.
  const isMinimalSportPage =
    pathname === "/" ||
    pathname === "/prediction" ||
    pathname === "/explore" ||
    pathname === "/shop" ||
    pathname.startsWith("/community/")
  const showBanner = isHome && !hideChrome

  // 로그인됐지만 온보딩 미완료 유저 → /sign-up으로 리다이렉트
  useOnboardingGuard()

  return (
    <div className="bg-background min-h-screen">
      {!hideChrome && !isMinimalSportPage && header}
      {/*
        배너 = 홈에서만. Minimal 페이지에선 inline(피드 위 정상 흐름),
        구 디자인 페이지에선 절대 오버레이(기존 sticky Header 아래 z-30).
      */}
      <div className="relative">
        {showBanner && isMinimalSportPage && (
          <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
            <AnnouncementCarousel />
          </div>
        )}
        {showBanner && !isMinimalSportPage && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
            <div className="pointer-events-auto mx-auto w-full max-w-[1280px] px-4 sm:px-6">
              <AnnouncementCarousel />
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
