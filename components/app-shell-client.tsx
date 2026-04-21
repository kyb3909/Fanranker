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

  // 로그인됐지만 온보딩 미완료 유저 → /sign-up으로 리다이렉트
  useOnboardingGuard()

  return (
    <div className="bg-background min-h-screen">
      {/* admin 페이지는 자체 레이아웃 사용 — 메인 헤더/배너 숨김 */}
      {!isAdmin && header}
      {!isAdmin && (
        <div className="mx-auto w-full max-w-[1280px] px-4 pt-3 sm:px-6">
          <AnnouncementCarousel />
        </div>
      )}
      {children}
    </div>
  )
}
