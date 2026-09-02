"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { WallPostCard, type WallPost } from "@/components/home/wall-post-card"
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
    <div className="flex flex-col gap-3">
      {posts.slice(0, shown).map((p) => (
        <WallPostCard key={p.id} post={p} surface="stream" />
      ))}
      {shown < posts.length ? (
        <div ref={sentinelRef} className="flex h-10 items-center justify-center">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div
          className="flex items-baseline justify-between rounded-xl px-4 py-3"
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
