"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
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

function extractLeadingEmoji(title: string): { emoji: string | null; rest: string } {
  const trimmed = title.trimStart()
  const match = trimmed.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u)
  if (!match) return { emoji: null, rest: trimmed }
  return { emoji: match[1], rest: trimmed.slice(match[0].length).trim() }
}

export function AnnouncementCarousel({ initialBanners }: { initialBanners?: unknown[] }) {
  const [dismissed, setDismissed] = useState(true) // 기본 숨김 (깜빡임 방지)

  const { data } = useSWR<{ banners: Banner[] }>("/api/banners", fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: !initialBanners,
    dedupingInterval: 60000,
    fallbackData: initialBanners ? { banners: initialBanners as Banner[] } : undefined,
  })

  const banners = data?.banners ?? []

  useEffect(() => {
    const until = localStorage.getItem(STORAGE_KEY)
    setDismissed(!!(until && Date.now() < Number(until)))
  }, [])

  const dismiss = () => {
    const midnight = new Date()
    midnight.setHours(24, 0, 0, 0)
    localStorage.setItem(STORAGE_KEY, String(midnight.getTime()))
    setDismissed(true)
  }

  if (dismissed || banners.length === 0) return null

  return (
    <section aria-label="공지 · 광고 배너" className="relative">
      {/* 검은 컨테이너 + 상단 헤어라인 + inset highlight로 레이어감. */}
      <div className="relative flex items-stretch overflow-hidden rounded-xl bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-inner ring-1 ring-white/5">
        <div className="flex-1 overflow-x-auto px-2.5 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="mx-auto flex w-fit snap-x snap-mandatory gap-2 sm:gap-2.5">
            {banners.map((b, i) => (
              <li
                key={b.id}
                className="w-[104px] flex-shrink-0 snap-start sm:w-[132px] md:w-[156px]"
              >
                <BannerCard banner={b} priority={i === 0} />
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={dismiss}
          className="flex flex-col items-center justify-center gap-1 border-l border-white/10 bg-black/20 px-2.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:px-3.5"
          aria-label="오늘 하루 보지 않기"
        >
          <X className="h-4 w-4" />
          <span className="text-center text-[9px] leading-tight sm:text-[10px]">
            오늘 하루
            <br />
            보지 않기
          </span>
        </button>
      </div>
    </section>
  )
}

function BannerCard({ banner, priority }: { banner: Banner; priority: boolean }) {
  const { emoji, rest } = extractLeadingEmoji(banner.title)
  const gradient = banner.gradient || "from-slate-600 to-slate-800"

  const card = (
    <article
      className={`group relative aspect-[4/3] overflow-hidden rounded-md shadow-lg ring-1 shadow-black/40 ring-white/10 transition-all hover:ring-white/25 ${
        banner.image_url ? "bg-neutral-800" : `bg-gradient-to-br ${gradient}`
      }`}
    >
      {banner.image_url ? (
        <>
          <Image
            src={banner.image_url}
            alt={banner.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(min-width: 768px) 168px, 108px"
            priority={priority}
          />
          {/* 하단 그라데이션 — 이미지 위 텍스트 가독성 */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent"
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 p-1.5 sm:p-2">
            <p className="line-clamp-2 text-[10px] leading-tight font-bold text-white drop-shadow sm:text-[11px]">
              {rest || banner.title}
            </p>
          </div>
        </>
      ) : (
        /* 플레이스홀더 — 이모지 + 제목을 카드 안에 통합 */
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-white">
          <span className="text-2xl leading-none drop-shadow-sm sm:text-3xl" aria-hidden="true">
            {emoji || "📢"}
          </span>
          <span className="line-clamp-2 text-[10px] leading-tight font-bold drop-shadow sm:text-[11px]">
            {rest || banner.title}
          </span>
        </div>
      )}
      {/* 상단 하이라이트 — 레이어 깊이감 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/15 to-transparent"
        aria-hidden="true"
      />
    </article>
  )

  if (banner.link_url) {
    return (
      <Link href={banner.link_url} className="block">
        {card}
      </Link>
    )
  }
  return card
}
