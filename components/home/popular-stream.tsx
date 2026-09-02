"use client"

import { useContext, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { WallChromeContext, WallPostCard, type WallPost } from "@/components/home/wall-post-card"
import { trackEvent } from "@/lib/analytics/events"

const PAGE = 8

/**
 * 뉴스를 끈 홈 (2026-09-03 운영자: "뉴스를 끄면 쫙 인기 게시물들이 올라와서 진짜 SNS나
 * 인스타그램처럼"). 인기 풀(cached-home-data.getCachedPopularBoardPosts)을 큰 카드로 흘린다.
 *
 * 풀은 서버가 이미 통째로(최대 40건) 실어 보내므로 API 왕복 없이 스크롤에 맞춰 드러내기만
 * 한다 — 한 달치 사람 글이 40건을 넘는 날이 오면 그때 페이지 API 를 단다.
 */
export function PopularStream({ posts, onNewsOn }: { posts: WallPost[]; onNewsOn: () => void }) {
  const chrome = useContext(WallChromeContext)
  const [shown, setShown] = useState(PAGE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setShown((s) => Math.min(s + PAGE, posts.length))
      },
      { rootMargin: "600px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [posts.length, shown])

  useEffect(() => {
    trackEvent({ name: "home_popular_stream_open", params: { count: posts.length } })
  }, [posts.length])

  if (posts.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-2xl px-4 py-10 text-center"
        style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
      >
        <p className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
          아직 올라온 글이 없어요
        </p>
        <button
          type="button"
          onClick={onNewsOn}
          className="text-[13px] font-bold"
          style={{ color: "var(--wc-burgundy)" }}
        >
          뉴스 켜기 →
        </button>
      </div>
    )
  }

  return (
    // 전부 담벼락 글 — 구분할 상대가 없으니 구분 장치도 없다 (운영자: "죄다 와인색 헤더라 정신 사납다").
    // flat: 포스트 사이 괘선 한 줄(gap-0) = 인스타 타임라인 / card: 데스크톱은 카드 열(gap-3), 모바일은 괘선
    <div className={chrome === "card" ? "flex flex-col gap-0 sm:gap-3" : "flex flex-col gap-0"}>
      {posts.slice(0, shown).map((p) => (
        <WallPostCard key={p.id} post={p} surface="stream" />
      ))}
      {shown < posts.length ? (
        <div ref={sentinelRef} className="mt-3 flex h-10 items-center justify-center">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div
          className="mt-3 flex items-baseline justify-between rounded-xl px-4 py-3"
          style={{ background: "var(--wc-wine-tint)", border: "1px solid var(--wc-line)" }}
        >
          <span className="text-[13px] font-bold" style={{ color: "var(--wc-ink)" }}>
            최근 인기 글은 여기까지
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <Link
              href="/?tab=board"
              className="text-[12px] font-bold no-underline"
              style={{ color: "var(--wc-mute)" }}
            >
              담벼락 전체 →
            </Link>
            <button
              type="button"
              onClick={onNewsOn}
              className="text-[12px] font-bold"
              style={{ color: "var(--wc-burgundy)" }}
            >
              뉴스 켜기
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
