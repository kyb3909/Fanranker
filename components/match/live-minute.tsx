"use client"

import { useEffect, useState } from "react"

/**
 * 경과 분 타이머 (2026-08-22 운영자: "새로고침 안 해도 시간은 계속 올라갔으면").
 *
 * 서버(LFA)가 준 분이 **기준점**이고, 그 사이를 브라우저가 이어서 센다. LiveRefresher 가
 * 60초마다 서버를 다시 그리므로 기준점은 1분에 한 번 재동기화된다 — 로컬 추정은 그
 * 틈만 메운다. 폴링 API 를 새로 만들지 않는 이유도 같다 (LFA 크레딧은 서버 캐시가 지킴).
 *
 * ## 거짓말하지 않기 위한 규칙
 * - **하프 경계에서 멈춘다.** 하프타임엔 LFA 분이 45 에 멈춰 있는데 로컬로 계속 세면
 *   휴식 중에 52' 를 주장하게 된다. 45(전반)·90(후반)·105·120 에서 추정을 끊고 `+` 만
 *   붙인다 — 중계가 "45+" 라 쓰는 것과 같은 뜻이다. 실제 추가시간 분은 다음 서버
 *   동기화가 알려준다.
 * - **뒷걸음치지 않는다.** 첫 렌더는 서버 값 그대로 (하이드레이션 불일치 없음), 이후
 *   기준점이 바뀌면 거기서 다시 센다.
 * - 숫자로 못 읽는 값(HT 등)은 손대지 않고 그대로 낸다.
 */

/** "54" · "45 +4" · "45+4" → 기준 분과 추가시간 */
function parseMinute(minute: string): { base: number; stoppage: number | null } | null {
  const m = minute.match(/(\d+)(?:\s*\+\s*(\d+))?/)
  if (!m) return null
  return { base: Number(m[1]), stoppage: m[2] != null ? Number(m[2]) : null }
}

/** 이 분이 속한 하프의 끝 — 로컬 추정은 여기서 멈춘다 */
function halfCap(base: number): number {
  if (base <= 45) return 45
  if (base <= 90) return 90
  if (base <= 105) return 105
  return 120
}

const MAX_STOPPAGE = 15

export function LiveMinute({ minute }: { minute: string }) {
  // 서버 값 이후로 브라우저가 더 센 분. 첫 렌더는 반드시 0 — SSR 결과와 같아야 한다.
  const [ticked, setTicked] = useState(0)

  useEffect(() => {
    setTicked(0)
    const syncedAt = Date.now()
    const id = setInterval(() => {
      // 같은 값이면 React 가 리렌더를 건너뛴다 — 1초 간격이어도 실제 렌더는 분당 1회
      setTicked(Math.floor((Date.now() - syncedAt) / 60_000))
    }, 1000)
    return () => clearInterval(id)
  }, [minute])

  const parsed = parseMinute(minute)
  if (!parsed) return <span className="gn-num">{minute}</span>

  // 이미 추가시간이면 추가시간 쪽을 센다 (45+2 → 45+3)
  if (parsed.stoppage != null) {
    const s = Math.min(parsed.stoppage + ticked, MAX_STOPPAGE)
    return (
      <span className="gn-num" suppressHydrationWarning>
        {parsed.base}+{s}&#8242;
      </span>
    )
  }

  const cap = halfCap(parsed.base)
  const raw = parsed.base + ticked
  const over = raw > cap
  return (
    <span className="gn-num" suppressHydrationWarning>
      {over ? cap : raw}
      {over ? "+" : ""}&#8242;
    </span>
  )
}
