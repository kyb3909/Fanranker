"use client"

import { useEffect, useState } from "react"

interface SpeechBubbleProps {
  text: string
  duration?: number
  onExpire?: () => void
}

export function SpeechBubble({ text, duration = 5000, onExpire }: SpeechBubbleProps) {
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    const fadeStart = duration - 800

    const fadeTimer = setTimeout(() => {
      setOpacity(0)
    }, fadeStart)

    const removeTimer = setTimeout(() => {
      onExpire?.()
    }, duration)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [duration, onExpire])

  return (
    <div
      className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2"
      style={{ opacity, transition: "opacity 800ms ease-out" }}
    >
      <div className="relative max-w-[220px] min-w-[120px] rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-900 shadow-lg sm:max-w-[260px]">
        <p className="leading-snug break-words">
          {text.slice(0, 50)}
          {text.length > 50 ? "..." : ""}
        </p>
        {/* 말풍선 꼬리 */}
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
          <div className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white" />
        </div>
      </div>
    </div>
  )
}
