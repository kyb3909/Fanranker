"use client"

import type { ReactNode } from "react"
import { Header } from "@/components/header"

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="bg-background min-h-screen">
      {/* 전역 헤더 영역: 검색바 + 상단 탭 (window 스크롤 기준 sticky) */}
      <Header />
      {/* 페이지별 콘텐츠: window 자체가 스크롤 컨테이너가 되도록 별도 overflow는 두지 않음 */}
      {children}
    </div>
  )
}
