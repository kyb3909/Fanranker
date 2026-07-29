"use client"

import { useEffect } from "react"
import { captureAttribution, channelParams, markLandingFired } from "@/lib/analytics/attribution"
import { trackEvent } from "@/lib/analytics/events"

/**
 * 루트 레이아웃에 한 번 마운트되어 유입 채널을 고정하고 랜딩 도달을 기록한다.
 *
 * 클라이언트 네비게이션에서는 다시 마운트되지 않으므로, 마운트 시점의 URL 이
 * 곧 이 방문의 착지 지점이다 — 랜딩 계측에 필요한 게 정확히 그것이다.
 * 렌더 결과가 없어 레이아웃/LCP 에 영향을 주지 않는다.
 */
export function AttributionTracker() {
  useEffect(() => {
    const attr = captureAttribution()
    if (!markLandingFired()) return
    trackEvent({
      name: "landing_view",
      params: { ...channelParams(attr), path: window.location.pathname },
    })
  }, [])

  return null
}
