import type { ReactNode } from "react"

interface MinimalShellProps {
  topbar: ReactNode
  sidebar: ReactNode
  aside: ReactNode
  /** Topbar 바로 아래 사이트 폭으로 깔리는 영역 (예: 라이브 뉴스 티커). 옵션. */
  ticker?: ReactNode
  children: ReactNode
}

/**
 * Minimal Sport 디자인 전용 레이아웃 셸.
 *
 * - 그리드: 64px topbar + (220px sidebar + 1fr feed + 300px right aside)
 * - 1280px max-width
 * - 데스크톱(lg+) 전용. 모바일은 부모 AppShell의 기존 헤더 + children 직접 노출.
 *
 * 두 페이지(/, /prediction)에서 사용. 다른 페이지는 영향 없음.
 */
export function MinimalShell({ topbar, sidebar, aside, ticker, children }: MinimalShellProps) {
  return (
    <div className="theme-minimal-sport min-h-screen">
      <div className="mx-auto w-full max-w-[1280px]">
        <header className="sticky top-0 z-40 h-14 border-b border-[var(--ms-line)] bg-[var(--ms-bg)]/85 backdrop-blur-xl lg:h-16">
          {topbar}
        </header>
        {ticker && (
          <div className="border-b border-[var(--ms-line)]" aria-label="라이브 트래커">
            {ticker}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px]">
          <aside className="hidden border-r border-[var(--ms-line)] px-4 py-6 lg:block">
            {sidebar}
          </aside>
          <main className="safe-area-pb-tabbar min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            {children}
          </main>
          <aside className="hidden border-l border-[var(--ms-line)] px-4 py-6 lg:block">
            {aside}
          </aside>
        </div>
      </div>
    </div>
  )
}
