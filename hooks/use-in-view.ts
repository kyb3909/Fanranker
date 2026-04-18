"use client"

import { useEffect, useRef, useState } from "react"

/**
 * IntersectionObserver 기반 in-view 감지 훅.
 *
 * 한 번 보이면 disconnect — lazy 로드 트리거용.
 * 동영상 자동 정지처럼 뷰포트 이탈 감지가 필요하면 `useVisibility`를 사용할 것.
 */
export function useInView(rootMargin = "200px") {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return { ref, inView }
}
