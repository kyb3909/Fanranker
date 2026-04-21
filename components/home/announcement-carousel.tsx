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
      {/* 검은 컨테이너로 감싸고, 오른쪽에 닫기 컨트롤. 컨텐츠가 넘치면 슬라이드. */}
      <div className="flex items-stretch overflow-hidden rounded-xl bg-neutral-900 shadow-sm">
        <div className="flex-1 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-3 sm:py-3 [&::-webkit-scrollbar]:hidden">
          <ul className="mx-auto flex w-fit snap-x snap-mandatory gap-2 sm:gap-3">
            {banners.map((b, i) => (
              <li
                key={b.id}
                className="w-[108px] flex-shrink-0 snap-start sm:w-[140px] md:w-[168px]"
              >
                <BannerCard banner={b} priority={i === 0} />
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={dismiss}
          className="flex flex-col items-center justify-center gap-1 border-l border-white/10 px-2.5 text-white/60 transition-colors hover:bg-white/5 hover:text-white sm:px-3.5"
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
    <article className="group">
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-lg ${
          banner.image_url ? "bg-muted" : `bg-gradient-to-br ${gradient}`
        }`}
      >
        {banner.image_url ? (
          <Image
            src={banner.image_url}
            alt={banner.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(min-width: 768px) 168px, 108px"
            priority={priority}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-white">
            <span className="text-2xl leading-none sm:text-3xl" aria-hidden="true">
              {emoji || "📢"}
            </span>
            <span className="line-clamp-2 text-[10px] leading-tight font-bold sm:text-[11px]">
              {rest || banner.title}
            </span>
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight font-semibold text-white/90 sm:text-[12px]">
        {rest || banner.title}
      </p>
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
