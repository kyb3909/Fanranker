"use client"

import { useState } from "react"

/**
 * 불판 타임라인 접기 (2026-08-20 운영자: "6-7행만 최근꺼 보이게, 접고 펼 수 있게 —
 * 저기는 결국 댓글로 지지고 볶는 게 목표라").
 *
 * 행 자체는 서버가 렌더해 children 으로 내려온다 — 이 컴포넌트는 펼침 상태만 쥔다.
 */
export function CollapsibleRows({
  head,
  rest,
  restCount,
}: {
  head: React.ReactNode
  rest: React.ReactNode
  restCount: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <ul className="mt-2.5 space-y-1.5">
      {head}
      {open && rest}
      {restCount > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full rounded-lg py-1.5 text-[11.5px] font-bold transition-opacity hover:opacity-80"
            style={{ color: "var(--gn-cream-dim)", background: "rgba(245,239,231,0.04)" }}
          >
            {open ? "접기 ▴" : `이전 상황 ${restCount}개 보기 ▾`}
          </button>
        </li>
      )}
    </ul>
  )
}
