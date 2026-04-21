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
  const isAdmin = pathname.startsWith("/admin")
  // 메타버스는 풀뷰포트 Phaser 씬 — 헤더/배너/탭바 전부 제거
  const isMetaverse = pathname.startsWith("/metaverse")
  const hideChrome = isAdmin || isMetaverse

  // 로그인됐지만 온보딩 미완료 유저 → /sign-up으로 리다이렉트
  useOnboardingGuard()

  return (
    <div className="bg-background min-h-screen">
      {/* admin·metaverse 페이지는 자체 레이아웃 사용 — 메인 헤더/배너 숨김 */}
      {!hideChrome && header}
      {/* 배너 = 피드 위 오버레이 레이어. 같은 relative 컨테이너 안에서
          배너는 absolute로 상단 고정, children은 정상 플로우 → 배너가 피드 상단을 덮는다. */}
      <div className="relative">
        {!hideChrome && (
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
