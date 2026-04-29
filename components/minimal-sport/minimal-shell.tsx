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
    <div className="theme-minimal-sport hidden min-h-screen lg:block">
      <div className="mx-auto w-full max-w-[1280px]">
        <header className="sticky top-0 z-40 h-16 border-b border-[var(--ms-line)] bg-[var(--ms-bg)]/85 backdrop-blur-xl">
          {topbar}
        </header>
        {ticker && (
          <div className="border-b border-[var(--ms-line)]" aria-label="라이브 트래커">
            {ticker}
          </div>
        )}
        <div className="grid grid-cols-[220px_1fr_300px] gap-0">
          <aside className="border-r border-[var(--ms-line)] px-4 py-6">{sidebar}</aside>
          <main className="min-w-0 px-8 py-7">{children}</main>
          <aside className="border-l border-[var(--ms-line)] px-4 py-6">{aside}</aside>
        </div>
      </div>
    </div>
  )
}
