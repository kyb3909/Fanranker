"use client"

import { useEffect, useRef } from "react"

/**
 * 뷰포트 이탈 시 onHidden 콜백 호출.
 *
 * 동영상 자동 정지 등에 사용. 한 번 보인 뒤 다시 숨겨질 때마다 호출됨.
 */
export function useVisibility(onHidden: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          onHidden()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onHidden])

  return ref
}
