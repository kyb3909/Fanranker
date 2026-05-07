"use client"

import { Fragment, useEffect, useState } from "react"

interface CountdownProps {
  /** ISO 8601 datetime string (예: "2026-06-11T00:00:00+09:00") */
  target: string
  label?: string
}

/**
 * 월드컵 이벤트 카운트다운 — Hero 안 4 셀 (일/시/분/초).
 *
 * SSR-safe: mount 전에는 "--" placeholder, mount 후 client time 으로 갱신.
 * (formatRelativeTime / SSR 시간 사용 시 React #418 hydration mismatch 패턴 회피)
 */
export function Countdown({ target, label = "이벤트 시작까지" }: CountdownProps) {
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState<number>(0)

  useEffect(() => {
    setMounted(true)
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const targetMs = new Date(target).getTime()
  const diff = mounted ? Math.max(0, targetMs - now) : 0
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1_000)

  const cells = [
    { num: mounted ? days.toString() : "--", unit: "DAYS" },
    { num: mounted ? hours.toString().padStart(2, "0") : "--", unit: "HOURS" },
    { num: mounted ? minutes.toString().padStart(2, "0") : "--", unit: "MIN" },
    { num: mounted ? seconds.toString().padStart(2, "0") : "--", unit: "SEC" },
  ]

  return (
    <div className="wc-cdown" aria-live="polite">
      <div className="wc-cdown-lbl">{label}</div>
      <div className="wc-cdown-cells">
        {cells.map((c, i) => (
          <Fragment key={c.unit}>
            <div className="wc-cdown-cell">
              <div className="wc-cdown-num">{c.num}</div>
              <div className="wc-cdown-u">{c.unit}</div>
            </div>
            {i < cells.length - 1 && (
              <span aria-hidden className="wc-cdown-sep">
                :
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
