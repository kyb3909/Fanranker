import type { ReactNode } from "react"

interface MinimalShellProps {
  topbar: ReactNode
  sidebar: ReactNode
  aside: ReactNode
  /** Topbar 아래 풀폭으로 등장하는 공지/광고 배너 (홈에서만). 좌우 끝까지 차지. */
  banner?: ReactNode
  /** banner 아래(또는 banner가 없으면 topbar 바로 아래) 깔리는 라이브 뉴스 티커. */
  ticker?: ReactNode
  children: ReactNode
}

/**
 * Minimal Sport 디자인 전용 레이아웃 셸.
 *
 * - Topbar는 풀폭 sticky, 내부에 max-w-1280 콘텐츠 정렬.
 * - 배너는 풀폭 absolute overlay (좌우 끝까지). 본문은 max-w-1280.
 * - 1280px 기준 그리드: 220px sidebar + 1fr feed + 300px aside.
 */
export function MinimalShell({
  topbar,
  sidebar,
  aside,
  banner,
  ticker,
  children,
}: MinimalShellProps) {
  return (
    <div className="theme-minimal-sport min-h-screen">
      {/* Topbar — 풀폭 sticky. 내부 layout(2-row)는 MinimalTopbar가 직접 처리. */}
      <header className="sticky top-0 z-40 border-b border-[var(--ms-line)] bg-[var(--ms-bg)]/85 backdrop-blur-xl">
        {topbar}
      </header>

      {/* 본문 영역 — banner는 풀폭 absolute overlay. 본문은 max-w-1280로 다시 제한. */}
      <div className="relative">
        {banner && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
            <div className="pointer-events-auto">{banner}</div>
          </div>
        )}
        <div className="mx-auto w-full max-w-[1280px]">
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
    </div>
  )
}
