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
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          공지 · 광고
        </span>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors"
          aria-label="오늘 하루 보지 않기"
        >
          <X className="h-3 w-3" />
          <span>오늘 하루 보지 않기</span>
        </button>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
        {banners.map((b, i) => (
          <li key={b.id}>
            <BannerCard banner={b} priority={i === 0} />
          </li>
        ))}
      </ul>
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
            sizes="(min-width: 768px) 200px, 33vw"
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
      <p className="text-foreground mt-1.5 line-clamp-2 text-[11px] leading-tight font-semibold sm:text-[12px]">
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
