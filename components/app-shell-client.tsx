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
  const showBanner = isHome && !hideChrome

  // 로그인됐지만 온보딩 미완료 유저 → /sign-up으로 리다이렉트
  useOnboardingGuard()

  return (
    <div className="bg-background min-h-screen">
      {!hideChrome && header}
      {/* 배너 = 피드 위 오버레이 레이어. 홈에서만 절대 위치로 상단 덮개. */}
      <div className="relative">
        {showBanner && (
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
