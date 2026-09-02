"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Zap } from "lucide-react"
import { NewsTalkBoard } from "./news-talk-board"

export type TickerTag = "live" | "breaking" | "result"

export interface TickerItemDetail {
  summary: string[]
  source: string
  sourceUrl: string
  redditUrl?: string
  thumbnailUrl?: string | null
  mediaType?: "youtube" | "image" | "article" | null
  participants: number
  score?: number
  category?: string
  importance?: number
  postedAt?: string
  originalTitle?: string
}

export interface TickerItem {
  id: string
  tag: TickerTag
  text: string
  /** 우리 글 페이지 (떡밥 공급원). 있으면 패널을 열지 않고 여기로 이동한다 (2026-09-02) */
  href?: string
  detail?: TickerItemDetail
}

/*
 * ⚠️ 여기 있던 `COMMUNITY_TICKER_ITEMS` 목업(게시판별 가짜 헤드라인 60여 줄)은 지웠다
 * (2026-09-02). API 가 비면 그걸 실시간인 척 띄웠다 — "손흥민 10호골" 같은 지어낸 소식을.
 * API 쪽 주석이 이미 "목업 폴백에 기대지 않는다"고 적어 놓았는데 컴포넌트는 여전히 기대고
 * 있었다. 이제 비면 "지금은 새 소식이 없습니다" 다. 그게 정직하다.
 */

interface NewsTickerProps {
  communitySlug: string
}

export function NewsTicker({ communitySlug }: NewsTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selectedItem, setSelectedItem] = useState<TickerItem | null>(null)
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([])
  /**
   * ⚠️ **로딩과 "소식 없음"을 구분한다** (2026-08-25 외부 감사).
   *    종전엔 둘 다 빈 배열이라 화면이 "실시간 소식을 불러오는 중…" 을 **영원히** 띄웠다.
   *    아스날 게시판이 그 상태로 며칠 있었고, 고장인지 아닌지 아무도 알 수 없었다.
   */
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchTicker() {
      try {
        const res = await fetch(`/api/community/${communitySlug}/ticker`)
        if (!res.ok) throw new Error("API error")
        const data = await res.json()
        if (!cancelled) setTickerItems(Array.isArray(data.items) ? data.items : [])
      } catch {
        // 실패·빈 결과 모두 빈 배열 — 가짜 소식으로 메우지 않는다
        if (!cancelled) setTickerItems([])
      }
    }

    const run = () => fetchTicker().finally(() => !cancelled && setLoading(false))

    run()
    // Refresh every 5 minutes
    const interval = setInterval(run, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [communitySlug])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || tickerItems.length === 0) return

    let animationId: number
    let position = 0
    const speed = 0.5
    // Cache scrollWidth to avoid forced reflow every frame
    let cachedHalfWidth = el.scrollWidth / 2

    function animate() {
      position += speed
      if (position >= cachedHalfWidth) {
        position = 0
      }
      el!.style.transform = `translateX(-${position}px)`
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    const pause = () => cancelAnimationFrame(animationId)
    const resume = () => {
      animationId = requestAnimationFrame(animate)
    }
    const container = el.parentElement
    // Mouse events (desktop)
    container?.addEventListener("mouseenter", pause)
    container?.addEventListener("mouseleave", resume)
    // Touch events (mobile)
    container?.addEventListener("touchstart", pause, { passive: true })
    container?.addEventListener("touchend", resume, { passive: true })

    // Recalculate cached width on resize
    const onResize = () => {
      cachedHalfWidth = el.scrollWidth / 2
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(animationId)
      container?.removeEventListener("mouseenter", pause)
      container?.removeEventListener("mouseleave", resume)
      container?.removeEventListener("touchstart", pause)
      container?.removeEventListener("touchend", resume)
      window.removeEventListener("resize", onResize)
    }
  }, [tickerItems])

  // 빈 상태도 같은 높이 컨테이너로 유지해 CLS 방지. items 가 mount 직후엔 항상 빈 배열
  // (useEffect 에서 fetch) → return null 하면 skeleton 64px → 0 → 43px 두 번 시프트 발생.
  // 외부 구조 유지하고 안쪽만 invisible 로 자리 잡아둠.
  if (tickerItems.length === 0) {
    // 높이는 동일하게 유지해 CLS 방지(return null 하면 64→0→43 두 번 시프트).
    // ⚠️ 문구는 **상태에 따라 다르다.** 소식이 없는데 "불러오는 중"이라고 하면
    //    고장으로 읽힌다 — 실제로 그렇게 읽혔다.
    return (
      <div
        className="w-full overflow-hidden border-b border-neutral-800 bg-neutral-900"
        aria-hidden
      >
        <div className="container mx-auto flex min-h-11 max-w-[1280px] items-center gap-2 px-4 py-2.5 sm:min-h-0">
          <Zap className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="text-[12px] font-bold tracking-wide text-white">LIVE</span>
          <span className="truncate text-[12px] text-neutral-400">
            {loading ? "실시간 소식을 불러오는 중…" : "지금은 새 소식이 없습니다"}
          </span>
        </div>
      </div>
    )
  }

  const items = [...tickerItems, ...tickerItems]

  return (
    <>
      <div className="w-full overflow-hidden border-b border-neutral-800 bg-neutral-900">
        <div className="container mx-auto flex max-w-[1280px] items-center">
          {/* LIVE 뱃지 - 고정 */}
          <div className="z-10 flex shrink-0 items-center gap-1.5 border-r border-neutral-700 px-4 py-2.5">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-[12px] font-bold tracking-wide text-white">LIVE</span>
            <span className="relative flex h-2 w-2">
              <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
            </span>
          </div>

          {/* 스크롤 영역 */}
          <div className="flex-1 overflow-hidden py-2.5">
            <div
              ref={scrollRef}
              className="flex items-center gap-10 whitespace-nowrap will-change-transform"
            >
              {items.map((item, i) =>
                item.href ? (
                  // 떡밥 항목 — 우리 글로 간다. 패널의 자체 댓글 스레드를 열면 글의 진짜
                  // 토론과 갈라진 그림자 스레드가 생기므로 패널을 쓰지 않는다 (2026-09-02).
                  <Link
                    key={`${item.id}-${i}`}
                    href={item.href}
                    className="group inline-flex min-h-11 shrink-0 items-center gap-2 sm:min-h-0"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                    <span className="text-[14px] font-medium text-neutral-300 transition-colors group-hover:text-white">
                      {item.text}
                    </span>
                  </Link>
                ) : (
                  <button
                    key={`${item.id}-${i}`}
                    onClick={() => setSelectedItem(item)}
                    className="group inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-none bg-transparent p-0 sm:min-h-0"
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                    <span className="text-[14px] font-medium text-neutral-300 transition-colors group-hover:text-white">
                      {item.text}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <NewsTalkBoard
          item={selectedItem}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  )
}
