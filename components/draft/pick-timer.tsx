"use client"

import { useEffect, useState, useRef } from "react"

interface PickTimerProps {
  duration: number // seconds
  isActive: boolean
  onTimeout: () => void
  onReset?: number // change this value to reset
}

export function PickTimer({ duration, isActive, onTimeout, onReset }: PickTimerProps) {
  const [remaining, setRemaining] = useState(duration)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasTimedOut = useRef(false)

  useEffect(() => {
    setRemaining(duration)
    hasTimedOut.current = false
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
          if (!hasTimedOut.current) {
            hasTimedOut.current = true
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

  const pct = (remaining / duration) * 100
  const isUrgent = remaining <= 10
  const isCritical = remaining <= 5

  return (
    <div className="flex items-center gap-3">
      <div className="bg-muted relative h-2.5 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isCritical ? "animate-pulse bg-red-500" : isUrgent ? "bg-orange-500" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`min-w-[3ch] text-right font-mono text-lg font-bold tabular-nums ${
          isCritical
            ? "animate-pulse text-red-500"
            : isUrgent
              ? "text-orange-500"
              : "text-foreground"
        }`}
      >
        {remaining}
      </span>
    </div>
  )
}
