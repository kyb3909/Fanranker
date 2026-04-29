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
  // admin 은 완전히 자체 레이아웃. Minimal 페이지는 자체 Topbar — 기존 Header 숨김.
  const hideChrome = pathname.startsWith("/admin")
  const isHome = pathname === "/"
  const isMinimalSportPage =
    pathname === "/" ||
    pathname === "/prediction" ||
    pathname === "/explore" ||
    pathname === "/shop" ||
    pathname.startsWith("/community/")

  // 홈인데 Minimal이 아닌 곳(=구 디자인 페이지에서 홈으로 라우팅 — 사실상 없음)에서는
  // 기존 sticky Header 아래 절대 오버레이로 배너 노출. Minimal 페이지의 배너는
  // home-client에서 MinimalShell.banner 슬롯으로 직접 주입 — 헤더 바로 아래 등장.
  const showLegacyOverlayBanner = isHome && !hideChrome && !isMinimalSportPage

  useOnboardingGuard()

  return (
    <div className="bg-background min-h-screen">
      {!hideChrome && !isMinimalSportPage && header}
      <div className="relative">
        {showLegacyOverlayBanner && (
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
