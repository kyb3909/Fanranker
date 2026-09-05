"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * 라이브 갱신기 (2026-08-20 — "경기 중엔 실시간 스탯과 점수가 보여야 매치센터지").
 *
 * 폴링 API 를 새로 만들지 않는다 — `router.refresh()` 로 서버 컴포넌트를 다시 그리면
 * 스코어·분·스탯·타임라인이 **기존 FT 렌더링 그대로** 갱신된다. 크레딧은 서버의
 * `cachedDetails(live)` 120초 캐시가 같은 경기의 요청을 공유한다.
 *
 * - 탭이 백그라운드면 쉬고, 돌아오면 즉시 한 번 당겨온다 (라인업 폴링과 같은 예우).
 * - 종료는 서버가 판정한다 — FT 로 다시 그려지면 이 컴포넌트 자체가 마운트에서 빠진다.
 */
export function LiveRefresher({ intervalMs = 120_000 }: { intervalMs?: number }) {
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
    // 첫 진입 5초 뒤 1회 당겨 그리기 (2026-08-21 운영자 제보: 무트래픽 시간대 첫 방문이
    // 54' 같은 30분 전 분을 보여줬다). unstable_cache 는 stale-while-revalidate — 오랜만의
    // 첫 요청은 직전 캐시를 그대로 내고 **뒤에서** 갱신한다. 그 갱신분을 120초 주기까지
    // 기다리지 않고 바로 반영한다. LFA 호출은 서버 120초 캐시가 그대로 지킨다.
    const warm = setTimeout(() => {
      if (!document.hidden) router.refresh()
    }, 5000)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (timer) clearInterval(timer)
      clearTimeout(warm)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router, intervalMs])

  return null
}
