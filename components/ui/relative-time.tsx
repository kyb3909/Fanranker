"use client"

import { useEffect, useState } from "react"
import { formatRelativeTime } from "@/lib/utils/date"

/**
 * 시간 차이를 표시하되 SSR/CSR hydration mismatch (React #418) 회피.
 *
 * 문제: `formatRelativeTime(new Date())` 가 server time vs client time 으로
 * 다른 결과를 만들어 React 의 hydration text mismatch 를 발생시킴.
 *   예) ISR 5분 캐시 → server "방금 전", client hydration "1분 전".
 *
 * 해결:
 *   1) SSR / 첫 paint 에는 절대 시각의 ISO 문자열을 표시 (mismatch 가 발생할 수 없음)
 *   2) hydration 후 useEffect 에서 상대 시간으로 교체
 *   3) 매 60초마다 갱신 (사용자 화면이 stale 안 되게)
 *
 * suppressHydrationWarning 까지 같이 두는 건 안전망 — 만일 누가 SSR
 * 시점에 다른 결과를 강제로 끼워넣어도 React 가 silent.
 */
export function RelativeTime({
  date,
  className,
}: {
  date: Date | string | number
  className?: string
}) {
  const iso =
    date instanceof Date
      ? date.toISOString()
      : typeof date === "number"
        ? new Date(date).toISOString()
        : date

  // SSR + 첫 paint: 절대 시각(ISO)
  // hydration 후: formatRelativeTime
  const [label, setLabel] = useState<string>(() => {
    // useState 의 lazy 초기화는 SSR/CSR 모두 1회 실행 — 같은 값 보장
    return ""
  })

  useEffect(() => {
    const d = new Date(iso)
    const update = () => setLabel(formatRelativeTime(d))
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [iso])

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label}
    </time>
  )
}
