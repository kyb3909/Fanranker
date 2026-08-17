"use client"

import { useState, type ReactNode } from "react"

/**
 * 매치 센터 탭 (2026-08-17, FotMob 참고).
 *
 * 서버에서 렌더된 섹션을 **props 로 받아** 보이기/숨기기만 한다 — 탭을 바꿔도 재요청이
 * 없고 SSR 도 그대로 산다. 내용이 없는 탭(null)은 버튼 자체를 만들지 않는다.
 */

interface TabDef {
  key: string
  label: string
  content: ReactNode
}

export function MatchTabs({
  info,
  lineup,
  stats,
  report,
  initial,
}: {
  info: ReactNode
  lineup: ReactNode
  stats: ReactNode
  report: ReactNode
  /** 종료 경기는 통계부터, 경기 전은 정보부터 */
  initial: "info" | "lineup" | "stats"
}) {
  const tabs: TabDef[] = [
    { key: "info", label: "정보", content: info },
    { key: "lineup", label: "라인업", content: lineup },
    { key: "stats", label: "통계", content: stats },
    { key: "report", label: "리포트", content: report },
  ].filter((t) => t.content != null && t.content !== false)

  const fallback = tabs.find((t) => t.key === initial)?.key ?? tabs[0]?.key
  const [active, setActive] = useState<string | undefined>(fallback)
  if (tabs.length === 0) return null

  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="경기 정보"
        className="scrollbar-none flex gap-1 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--wc-line)" }}
      >
        {tabs.map((t) => {
          const on = t.key === current.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className="shrink-0 px-3.5 py-2 text-[13px] font-bold transition-colors"
              style={{
                color: on ? "var(--wc-burgundy)" : "var(--wc-mute)",
                borderBottom: on ? "2px solid var(--wc-burgundy)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel">{current.content}</div>
    </div>
  )
}
