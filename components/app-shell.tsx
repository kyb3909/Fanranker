"use client"

import type { ReactNode } from "react"
import { Suspense } from "react"
import { usePathname } from "next/navigation"
import { Header } from "@/components/header/header"

interface AppShellProps {
  children: ReactNode
}

function HeaderFallback() {
  return (
    <header className="border-border bg-card/95 sticky top-0 z-50 w-full border-b backdrop-blur-md">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2" />
      </div>
    </header>
  )
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith("/admin")

  return (
    <div className="bg-background min-h-screen">
      {/* admin 페이지는 자체 레이아웃 사용 — 메인 헤더 숨김 */}
      {!isAdmin && (
        <Suspense fallback={<HeaderFallback />}>
          <Header />
        </Suspense>
      )}
      {children}
    </div>
  )
}
