"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { useOnboardingGuard } from "@/hooks/use-onboarding-guard"

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
      {/* admin 페이지는 자체 레이아웃 사용 — 메인 헤더 숨김 */}
      {!isAdmin && header}
      {children}
    </div>
  )
}
