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
  motm,
  report,
  initial,
}: {
  info: ReactNode
  lineup: ReactNode
  stats: ReactNode
  /** 팬 선정 MoTM (2026-08-22) — FT 후 폴이 있을 때만. 투표 중엔 이 탭이 첫 화면 */
  motm?: ReactNode
  report: ReactNode
  /** 종료 경기는 MoTM(투표 중)→통계, 경기 전은 정보부터 */
  initial: "info" | "lineup" | "stats" | "motm"
}) {
  const tabs: TabDef[] = [
    { key: "info", label: "정보", content: info },
    { key: "lineup", label: "라인업", content: lineup },
    { key: "stats", label: "통계", content: stats },
    { key: "motm", label: "MoTM", content: motm ?? null },
    { key: "report", label: "리포트", content: report },
  ].filter((t) => t.content != null && t.content !== false)

  const fallback = tabs.find((t) => t.key === initial)?.key ?? tabs[0]?.key
  const [active, setActive] = useState<string | undefined>(fallback)
  if (tabs.length === 0) return null

  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  return (
    <div>
      {/* 종이 좌우 끝까지 뻗는 탭 스트립 — 음수 마진으로 종이 패딩을 상쇄한다 */}
      {/* 허브 탭(일정/순위)과 같은 공통 문법 — 한 화면에 언더라인 탭 문법이 두 벌이었다
          (2026-08-20 폴리시 1-2). hover 잉크 상승·active·44px 타깃·가로 스크롤이
          .wc-underline-tabs 에 이미 다 들어 있다. */}
      <div
        role="tablist"
        aria-label="경기 상세 탭"
        className="wc-underline-tabs scroll -mx-4 sm:-mx-6"
      >
        {tabs.map((t) => {
          const on = t.key === current.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={on ? "on" : undefined}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {/* key 로 리마운트해 탭마다 페이드 인 — opacity 만, translate 금지 (폴리시 1-2) */}
      <div key={current.key} role="tabpanel" className="animate-in fade-in pt-6 duration-200">
        {current.content}
      </div>
    </div>
  )
}
