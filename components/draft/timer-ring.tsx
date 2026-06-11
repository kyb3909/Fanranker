"use client"

import { useEffect, useRef, useState } from "react"

interface TimerRingProps {
  duration: number
  isActive: boolean
  onTimeout: () => void
  /** 값이 변할 때마다 타이머 리셋 */
  onReset?: number
  size?: number
  /** dark 톱바 안에 들어갈 때 색 반전 */
  dark?: boolean
}

/**
 * SVG 원형 타이머. 진행도에 따라 stroke-dashoffset 변화.
 * 5초 이하에서 burgundy + 펄스. dark 모드는 ring base/text 컬러를 paper로.
 */
export function TimerRing({
  duration,
  isActive,
  onTimeout,
  onReset,
  size = 56,
  dark = false,
}: TimerRingProps) {
  const [remaining, setRemaining] = useState(duration)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasTimedOutRef = useRef(false)

  useEffect(() => {
    setRemaining(duration)
    hasTimedOutRef.current = false
  }, [duration, onReset])

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          if (!hasTimedOutRef.current) {
            hasTimedOutRef.current = true
            setTimeout(onTimeout, 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, onTimeout])

  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const pct = duration > 0 ? remaining / duration : 0
  const off = c * (1 - pct)
  const danger = remaining <= 5 && isActive

  const baseStroke = dark ? "rgba(246,228,232,0.2)" : "var(--draft-line)"
  const activeStroke = danger
    ? "var(--draft-burgundy)"
    : dark
      ? "var(--draft-paper)"
      : "var(--draft-ink)"
  const textColor = danger
    ? "var(--draft-burgundy)"
    : dark
      ? "var(--draft-paper)"
      : "var(--draft-ink)"

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-label={`남은 시간 ${remaining}초`}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={baseStroke} strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={activeStroke}
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1s linear, stroke .25s",
            animation: danger ? "draft-dotpulse 1s infinite" : "none",
          }}
        />
      </svg>
      <div
        className="draft-num"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--draft-font-title)",
          fontWeight: 900,
          fontSize: size >= 56 ? 18 : 14,
          color: textColor,
          transition: "color .2s",
        }}
      >
        {remaining}
      </div>
    </div>
  )
}
