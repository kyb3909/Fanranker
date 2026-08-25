"use client"

import { useEffect, useState } from "react"

/**
 * 시즌 대항전 다크 히어로용 카운트다운 — 일:시간:분:초 4셀 (시안 A).
 * 서버/첫 렌더는 "--" → 하이드레이션 불일치 없음 (매치데이 밴드 useCountdown 과 동일 원칙).
 */
export function HeroCountdown({ target, label }: { target: string; label: string }) {
  const [parts, setParts] = useState<[string, string, string, string] | null>(null)

  useEffect(() => {
    const ts = new Date(target).getTime()
    const tick = () => {
      const diff = Math.max(0, ts - Date.now())
      const d = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1000)
      const pad = (n: number) => String(n).padStart(2, "0")
      setParts([String(d), pad(h), pad(m), pad(s)])
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [target])

  const units = ["일", "시간", "분", "초"] as const

  return (
    <div
      className="inline-flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--gn-night-line)" }}
    >
      <span
        className="text-[12px] leading-tight font-bold"
        style={{ color: "var(--gn-cream-dim)", wordBreak: "keep-all" }}
      >
        {label}
      </span>
      <span className="flex items-baseline gap-1.5" suppressHydrationWarning>
        {units.map((u, i) => (
          <span key={u} className="flex items-baseline gap-1.5">
            {i > 0 && (
              <span
                aria-hidden
                className="gn-num text-[20px] font-bold"
                style={{ color: "var(--gn-cream-dim)" }}
              >
                :
              </span>
            )}
            <span className="flex flex-col items-center">
              <span
                className="gn-num text-[26px] leading-none font-bold"
                style={{ color: "var(--gn-cream)" }}
              >
                {parts ? parts[i] : "--"}
              </span>
              <span
                className="mt-1 text-[12px] font-bold"
                style={{ color: "var(--gn-cream-dim)", letterSpacing: "0.08em" }}
              >
                {u}
              </span>
            </span>
          </span>
        ))}
      </span>
    </div>
  )
}
