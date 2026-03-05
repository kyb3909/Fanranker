"use client"

import type { ReactNode } from "react"
import { Suspense } from "react"
import { Header } from "@/components/header"

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
  return (
    <div className="bg-background min-h-screen">
      {/* 전역 헤더 영역: useSearchParams 사용으로 Suspense 필요 (Next.js 15 prerender) */}
      <Suspense fallback={<HeaderFallback />}>
        <Header />
      </Suspense>
      {/* 페이지별 콘텐츠: window 자체가 스크롤 컨테이너가 되도록 별도 overflow는 두지 않음 */}
      {children}
    </div>
  )
}
