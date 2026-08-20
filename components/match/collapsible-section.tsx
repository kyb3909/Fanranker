"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

/**
 * 불판 중계 위젯용 접이식 섹션 (2026-08-20 — "스탯·라인업을 불판에 다 박아넣자").
 * 기본 접힘 — 불판의 주인공은 댓글판이다. 토글 문법은 MatchLineup 의 자체 토글과 동일
 * (버건디 라벨 + 셰브론)으로 맞춰 한 지면에서 두 위젯이 같은 물건으로 읽히게 한다.
 */
export function CollapsibleSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[12px] font-bold transition-colors"
        style={{ color: "var(--wc-burgundy)" }}
      >
        {title}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}
