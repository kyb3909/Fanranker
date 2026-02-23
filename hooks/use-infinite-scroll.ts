import { useEffect, useRef } from "react"

/**
 * IntersectionObserver 기반 무한스크롤 훅
 * @param onIntersect - 요소가 뷰포트에 들어왔을 때 실행할 콜백
 * @param options - IntersectionObserver 옵션 (기본: rootMargin 200px)
 */
export function useInfiniteScroll(
  onIntersect: () => void,
  options?: { rootMargin?: string; enabled?: boolean }
) {
  const ref = useRef<HTMLDivElement>(null)
  const { rootMargin = "200px", enabled = true } = options ?? {}

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onIntersect()
      },
      { rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect, rootMargin, enabled])

  return ref
}
