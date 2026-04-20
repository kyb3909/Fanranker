"use client"

import { useEffect } from "react"

/**
 * Service Worker 등록 컴포넌트.
 *
 * 현재 정책:
 * - Dev 환경에서는 SW 등록하지 않음 (HMR 충돌 방지).
 * - Prod 환경에서는 /sw.js를 등록하지만, 현재 /sw.js는 self-destruct 버전이라
 *   기존에 설치된 SW를 자동 정리하는 역할만 함. PWA 기능은 일시적으로 비활성.
 * - 추가로 이미 등록된 레거시 SW를 즉시 unregister하는 방어 로직 포함.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    // Dev: 이미 등록된 SW가 있으면 제거 + 캐시 비우기 (HMR 충돌 방지)
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) reg.unregister()
      })
      if ("caches" in window) {
        caches.keys().then((names) => names.forEach((n) => caches.delete(n)))
      }
      return
    }

    // Prod: sw.js 등록 (현재 self-destruct 버전)
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed silently
    })
  }, [])

  return null
}
