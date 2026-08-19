"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * 라이브 갱신기 (2026-08-20 — "경기 중엔 실시간 스탯과 점수가 보여야 매치센터지").
 *
 * 폴링 API 를 새로 만들지 않는다 — `router.refresh()` 로 서버 컴포넌트를 다시 그리면
 * 스코어·분·스탯·타임라인이 **기존 FT 렌더링 그대로** 갱신된다. 크레딧은 서버의
 * `cachedDetails(live)` 60초 캐시가 지킨다: 방문자가 몇 명이든 LFA 호출은 분당 1회.
 *
 * - 탭이 백그라운드면 쉬고, 돌아오면 즉시 한 번 당겨온다 (라인업 폴링과 같은 예우).
 * - 종료는 서버가 판정한다 — FT 로 다시 그려지면 이 컴포넌트 자체가 마운트에서 빠진다.
 */
export function LiveRefresher({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (!document.hidden) router.refresh()
      }, intervalMs)
    }
    const onVisible = () => {
      if (!document.hidden) router.refresh()
    }

    start()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router, intervalMs])

  return null
}
