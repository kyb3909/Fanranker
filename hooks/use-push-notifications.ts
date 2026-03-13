"use client"

import { useEffect, useRef, useCallback, useState } from "react"

interface PushNotificationOptions {
  /** 새 알림 개수가 변경되었을 때 호출 */
  onNewNotification?: (count: number) => void
  /** 알림 클릭 시 호출 */
  onNotificationClick?: () => void
}

export function usePushNotifications({
  onNewNotification,
  onNotificationClick,
}: PushNotificationOptions = {}) {
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const prevCountRef = useRef<number>(0)
  const onClickRef = useRef(onNotificationClick)
  onClickRef.current = onNotificationClick

  // 브라우저 알림 권한 상태 초기화
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission)
    }
  }, [])

  // 알림 권한 요청
  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied" as NotificationPermission
    }

    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  // 브라우저 알림 표시
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission !== "granted") return
    if (document.visibilityState === "visible") return // 탭이 보이면 브라우저 알림 불필요

    const notification = new Notification(title, {
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      ...options,
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
      onClickRef.current?.()
    }

    // 5초 후 자동 닫기
    setTimeout(() => notification.close(), 5000)
  }, [])

  // 새 알림 개수 변경 감지 → 브라우저 알림 트리거
  const handleCountChange = useCallback(
    (newCount: number) => {
      if (newCount > prevCountRef.current && prevCountRef.current >= 0) {
        const diff = newCount - prevCountRef.current
        showNotification("새 알림", {
          body: `새로운 알림이 ${diff}개 도착했습니다.`,
          tag: "fanranker-notification",
        })
        onNewNotification?.(newCount)
      }
      prevCountRef.current = newCount
    },
    [showNotification, onNewNotification]
  )

  return {
    permission,
    requestPermission,
    showNotification,
    handleCountChange,
    isSupported: typeof window !== "undefined" && "Notification" in window,
  }
}
