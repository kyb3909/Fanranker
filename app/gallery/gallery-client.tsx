"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react"

export interface GalleryItem {
  id: string
  tweet_url: string
  author_name: string | null
  author_handle: string | null
  media: { type: string; url: string; thumbnail_url?: string | null }[]
  tag: string | null
}

interface Slide {
  url: string
  thumb: string
  tweetUrl: string
  author: string
}

/**
 * 갤러리 그리드 + 라이트박스 슬라이드쇼.
 *
 * 운영자 요청(2026-08-14): 미리보기는 X 카드 없이 **사진만**, 좌우 키로 슬라이드쇼처럼.
 * 출처 원칙과의 절충 — 사진 위 UI 는 걷어내되 하단 한 줄(촬영자 · 원문 링크)은 상시.
 * 이미지는 X CDN 직참조 (재호스팅 없음).
 */
export function GalleryClient({ items }: { items: GalleryItem[] }) {
  // 트윗 한 장이 사진 여러 장을 담을 수 있다 — 슬라이드는 사진 단위로 편다
  const slides: Slide[] = items.flatMap((item) =>
    (item.media ?? [])
      .filter((m) => m.type === "photo" && m.url)
      .map((m) => ({
        url: m.url,
        thumb: m.thumbnail_url || m.url,
        tweetUrl: item.tweet_url,
        author: [item.author_name, item.author_handle].filter(Boolean).join(" ") || "출처",
      }))
  )

  const [open, setOpen] = useState<number | null>(null)

  if (slides.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-16 text-center"
        style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
      >
        <p className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
          아직 등록된 사진이 없어요
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
          운영자가 큐레이션한 사진이 이곳에 차곡차곡 쌓입니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {slides.map((s, i) => (
          <button
            key={`${s.tweetUrl}-${i}`}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative aspect-[3/4] overflow-hidden rounded-lg"
            style={{ background: "var(--wc-soft)" }}
            aria-label={`사진 크게 보기 (${s.author})`}
          >
            <Image
              src={s.thumb}
              alt={s.author}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
              className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <Lightbox slides={slides} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

function Lightbox({
  slides,
  index,
  onIndex,
  onClose,
}: {
  slides: Slide[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const slide = slides[index]
  const touchStartX = useRef<number | null>(null)

  const prev = useCallback(
    () => onIndex((index - 1 + slides.length) % slides.length),
    [index, slides.length, onIndex]
  )
  const next = useCallback(
    () => onIndex((index + 1) % slides.length),
    [index, slides.length, onIndex]
  )

  // 좌우 키 = 슬라이드쇼 넘김, ESC = 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev()
      else if (e.key === "ArrowRight") next()
      else if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prev, next, onClose])

  // 뒤 배경 스크롤 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (!slide) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="사진 슬라이드쇼"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start === null) return
        const dx = (e.changedTouches[0]?.clientX ?? start) - start
        if (Math.abs(dx) > 40) (dx > 0 ? prev : next)()
      }}
    >
      {/* 상단: 카운터 + 닫기 */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[13px] font-semibold tabular-nums">
          {index + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded-full p-2 transition-colors hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 사진 — X 카드 UI 없이 사진만 */}
      <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <Image
          key={slide.url}
          src={slide.url}
          alt={slide.author}
          fill
          sizes="100vw"
          priority
          className="object-contain"
        />
        <button
          type="button"
          onClick={prev}
          aria-label="이전 사진"
          className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white transition-colors hover:bg-black/70"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="다음 사진"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white transition-colors hover:bg-black/70"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* 하단: 출처 한 줄 — 사진만 보여주되 촬영자 귀속은 상시 */}
      <div
        className="flex items-center justify-center gap-2 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[12px] text-white/70">📷 {slide.author}</span>
        <a
          href={slide.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-white/90 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          원문 보기
        </a>
      </div>
    </div>
  )
}
