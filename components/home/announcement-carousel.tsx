"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
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

  const banners = data?.banners ?? []

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

  const prev = () => goTo((current - 1 + banners.length) % banners.length)
  const next = () => goTo((current + 1) % banners.length)

  const dismiss = () => {
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    localStorage.setItem(STORAGE_KEY, String(Date.now() + oneWeek))
    setDismissed(true)
  }

  if (dismissed || banners.length === 0) return null

  const banner = banners[current]
  if (!banner) return null
  const isImageBanner = !!banner.image_url

  const content = (
    <div
      className="relative min-h-[120px] overflow-hidden rounded-xl sm:min-h-[160px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isImageBanner ? (
        /* 이미지 배너 */
        <div className="relative aspect-[3/1] w-full sm:aspect-[4/1]">
          <Image
            src={banner.image_url!}
            alt={banner.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 600px"
            priority={current === 0}
          />
          {/* 이미지 위 오버레이 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 p-4 sm:p-6">
            <h2 className="text-[15px] leading-tight font-bold text-white sm:text-[18px]">
              {banner.title}
            </h2>
            {banner.description && (
              <p className="mt-1 text-[12px] text-white/80 sm:text-[13px]">{banner.description}</p>
            )}
          </div>
        </div>
      ) : (
        /* 그라데이션 + 텍스트 배너 */
        <div
          className={`bg-gradient-to-r ${banner.gradient || "from-blue-600 to-indigo-700"} px-6 py-6 text-white sm:px-8 sm:py-8`}
        >
          <div className="pr-8 sm:pr-32">
            <h2 className="text-[17px] leading-tight font-bold sm:text-[20px]">{banner.title}</h2>
            {banner.description && (
              <p className="mt-2 text-[13px] leading-relaxed text-white/85 sm:text-[14px]">
                {banner.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 닫기 버튼 */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dismiss()
        }}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-[12px] text-white/90 backdrop-blur-sm transition-colors hover:bg-black/50"
        aria-label="일주일간 안보기"
      >
        <X className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">일주일간 안보기</span>
      </button>

      {/* 네비게이션 (2개 이상일 때만) */}
      {banners.length > 1 && (
        <div className="absolute right-3 bottom-3 z-10 flex items-center gap-2">
          {/* 도트 인디케이터 */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="슬라이드">
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
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>

          {/* 화살표 */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                prev()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 transition-colors hover:bg-black/50"
              aria-label="이전"
            >
              <ChevronLeft className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                next()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 transition-colors hover:bg-black/50"
              aria-label="다음"
            >
              <ChevronRight className="h-4 w-4 text-white" />
            </button>
          </div>
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
