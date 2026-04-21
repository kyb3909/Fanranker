"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ChevronRight, X } from "lucide-react"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

interface Banner {
  id: string
  title: string
  description: string | null
  image_url: string | null
  link_url: string | null
  gradient: string | null
}

const STORAGE_KEY = "announcement_dismissed_until"

/**
 * 제목 앞쪽의 선행 이모지를 분리.
 * 예: "🏟️ 공놀이판 가오픈 중!" → { emoji: "🏟️", rest: "공놀이판 가오픈 중!" }
 * 이모지가 없으면 emoji: null.
 */
function extractLeadingEmoji(title: string): { emoji: string | null; rest: string } {
  const trimmed = title.trimStart()
  // Extended_Pictographic 유니코드 속성으로 이모지(+ 변형 선택자) 1개 추출
  const match = trimmed.match(
    /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u
  )
  if (!match) return { emoji: null, rest: trimmed }
  const emoji = match[1]
  const rest = trimmed.slice(match[0].length).trim()
  return { emoji, rest }
}

export function AnnouncementCarousel({ initialBanners }: { initialBanners?: unknown[] }) {
  const [dismissed, setDismissed] = useState(true) // 기본 숨김 (깜빡임 방지)
  const [current, setCurrent] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data } = useSWR<{ banners: Banner[] }>("/api/banners", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: !initialBanners,
    dedupingInterval: 60000,
    fallbackData: initialBanners ? { banners: initialBanners as Banner[] } : undefined,
  })

  // 최대 3개까지만 노출 (운영 정책 — API도 같은 제한을 걸지만 이중 방어).
  const banners = (data?.banners ?? []).slice(0, 3)

  useEffect(() => {
    const until = localStorage.getItem(STORAGE_KEY)
    if (until && Date.now() < Number(until)) {
      setDismissed(true)
    } else {
      setDismissed(false)
    }
  }, [])

  const startAutoPlay = useCallback(() => {
    if (banners.length <= 1) return
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length)
    }, 5000)
  }, [banners.length])

  const stopAutoPlay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!dismissed && !isHovered) {
      startAutoPlay()
    }
    return stopAutoPlay
  }, [dismissed, isHovered, startAutoPlay, stopAutoPlay])

  const goTo = (index: number) => {
    setCurrent(index)
    stopAutoPlay()
    startAutoPlay()
  }

  const dismiss = () => {
    // 당일 자정(익일 00:00 KST — 클라이언트 로컬 타임존 상정)까지 숨김.
    const midnight = new Date()
    midnight.setHours(24, 0, 0, 0)
    localStorage.setItem(STORAGE_KEY, String(midnight.getTime()))
    setDismissed(true)
  }

  if (dismissed || banners.length === 0) return null

  const banner = banners[current]
  if (!banner) return null
  const isImageBanner = !!banner.image_url
  const { emoji, rest } = extractLeadingEmoji(banner.title)

  const content = (
    <div
      className="relative overflow-hidden rounded-xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isImageBanner ? (
        /* 이미지 배너 — 슬림 가로 레이아웃 */
        <div
          className={`bg-gradient-to-r ${banner.gradient || "from-slate-700 to-slate-900"} relative flex min-h-[72px] items-center gap-3 px-3 py-2.5 text-white sm:min-h-[88px] sm:gap-4 sm:px-4 sm:py-3`}
        >
          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-white/10 sm:h-16 sm:w-16">
            <Image
              src={banner.image_url!}
              alt={banner.title}
              fill
              className="object-cover"
              sizes="64px"
              priority={current === 0}
            />
          </div>
          <div className="min-w-0 flex-1 pr-16 sm:pr-28">
            <h2 className="truncate text-[14px] leading-tight font-bold sm:text-[16px]">
              {banner.title}
            </h2>
            {banner.description && (
              <p className="mt-0.5 truncate text-[11px] text-white/85 sm:text-[13px]">
                {banner.description}
              </p>
            )}
          </div>
          {banner.link_url && (
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-white/80" aria-hidden="true" />
          )}
        </div>
      ) : (
        /* 그라데이션 + 텍스트 배너 — 슬림 */
        <div
          className={`bg-gradient-to-r ${banner.gradient || "from-blue-600 to-indigo-700"} relative flex min-h-[72px] items-center gap-3 px-3 py-2.5 text-white sm:min-h-[88px] sm:gap-4 sm:px-4 sm:py-3`}
        >
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-[22px] leading-none sm:h-14 sm:w-14 sm:text-[26px]"
            aria-hidden="true"
          >
            {emoji || "📢"}
          </div>
          <div className="min-w-0 flex-1 pr-16 sm:pr-28">
            <h2 className="truncate text-[14px] leading-tight font-bold sm:text-[16px]">
              {rest || banner.title}
            </h2>
            {banner.description && (
              <p className="mt-0.5 truncate text-[11px] text-white/85 sm:text-[13px]">
                {banner.description}
              </p>
            )}
          </div>
          {banner.link_url && (
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-white/80" aria-hidden="true" />
          )}
        </div>
      )}

      {/* 닫기 버튼 (우상단) */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dismiss()
        }}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/25 px-2 py-1 text-[10px] text-white/90 backdrop-blur-sm transition-colors hover:bg-black/45"
        aria-label="오늘 하루 보지 않기"
      >
        <X className="h-3 w-3" />
        <span className="hidden sm:inline">오늘 하루 보지 않기</span>
      </button>

      {/* 페이지 번호 + 도트 (우하단, 2개 이상일 때만) */}
      {banners.length > 1 && (
        <div className="absolute right-2 bottom-2 z-10 flex items-center gap-2">
          <div className="flex items-center gap-1" role="tablist" aria-label="배너 슬라이드">
            {banners.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === current}
                aria-label={`슬라이드 ${i + 1}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  goTo(i)
                }}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === current ? "w-4 bg-white" : "w-1 bg-white/50 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
          <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 tabular-nums backdrop-blur-sm">
            {current + 1} / {banners.length}
          </span>
        </div>
      )}
    </div>
  )

  // 링크가 있으면 클릭 시 이동
  if (banner.link_url) {
    return (
      <Link href={banner.link_url} className="block">
        {content}
      </Link>
    )
  }

  return content
}
