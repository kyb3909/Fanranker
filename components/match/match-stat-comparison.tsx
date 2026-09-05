"use client"

import { useId, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { splitMatchStats } from "@/lib/match/stat-presentation"
import type { LfaStatRow } from "@/lib/lfa/match"

function StatRows({ rows, label }: { rows: LfaStatRow[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-[var(--wc-line)]">
      {rows.map((s) => {
        const total = s.homeNum != null && s.awayNum != null ? s.homeNum + s.awayNum : null
        const homePct =
          total && total > 0 ? Math.max(0, Math.min(100, (s.homeNum! / total) * 100)) : 50
        return (
          <li key={s.label} className="py-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
              <span className="gn-num text-[16px] font-bold" style={{ color: "var(--wc-ink)" }}>
                {s.home}
              </span>
              <span
                className="text-center text-[13px] font-medium"
                style={{ color: "var(--wc-mute)" }}
              >
                {s.label === "상대 박스 터치" ? "상대 박스안 터치" : s.label}
              </span>
              <span
                className="gn-num text-right text-[16px] font-bold"
                style={{ color: "var(--wc-ink)" }}
              >
                {s.away}
              </span>
            </div>
            <div aria-hidden className="mt-2 flex h-1 gap-1 overflow-hidden rounded-full">
              <span
                className="rounded-full"
                style={{ width: `${homePct}%`, background: "var(--wc-burgundy)" }}
              />
              <span
                className="flex-1 rounded-full"
                style={{ background: "var(--wc-ink)", opacity: 0.65 }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function MatchStatComparison({
  stats,
  homeTeam,
  awayTeam,
}: {
  stats: LfaStatRow[]
  homeTeam: string
  awayTeam: string
}) {
  const [expanded, setExpanded] = useState(false)
  const extraId = useId()
  const { primary, additional } = splitMatchStats(stats)
  if (!stats.length) return null
  return (
    <section aria-label="경기 스탯">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="sheet-lab">경기 스탯</h2>
        <span className="text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
          주요 기록
        </span>
      </div>
      <div
        className="mt-3 flex justify-between gap-4 rounded-lg px-3 py-2 text-[13px] font-bold"
        style={{ background: "var(--wc-soft)" }}
      >
        <span className="min-w-0 truncate" style={{ color: "var(--wc-burgundy)" }}>
          {homeTeam}
        </span>
        <span className="min-w-0 truncate text-right" style={{ color: "var(--wc-ink)" }}>
          {awayTeam}
        </span>
      </div>
      <StatRows rows={primary} label="주요 스탯" />
      {!primary.length && (
        <p className="py-3 text-[13px]" style={{ color: "var(--wc-mute)" }}>
          주요 스탯은 아직 제공되지 않았습니다.
        </p>
      )}
      {additional.length > 0 && (
        <>
          <div id={extraId} hidden={!expanded}>
            <StatRows rows={additional} label="추가 스탯" />
          </div>
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={extraId}
            >
              {expanded ? "추가 스탯 접기" : `추가 스탯 보기 (${additional.length})`}
              {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
