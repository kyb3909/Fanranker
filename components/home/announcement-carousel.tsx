"use client"

import { useState, useEffect } from "react"
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
  const [dismissed, setDismissed] = useState(true)

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
    <section
      aria-label="공지 · 광고 배너"
      className="flex items-stretch overflow-hidden rounded-lg bg-neutral-950"
    >
      {/* 좌측 안내 라벨 — 참고 이미지처럼 매우 작게 */}
      <div className="hidden items-center px-3 text-[10px] leading-tight text-white/35 sm:flex">
        오늘의
        <br />
        공지
      </div>

      {/* 중앙 슬립 — 세로 비율 썸네일을 중앙 정렬 + 가로 슬라이드 */}
      <div className="flex-1 overflow-x-auto py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="mx-auto flex w-fit snap-x snap-mandatory gap-1.5 px-2">
          {banners.map((b, i) => (
            <li key={b.id} className="w-[88px] flex-shrink-0 snap-start sm:w-[104px] md:w-[120px]">
              <BannerCard banner={b} priority={i === 0} />
            </li>
          ))}
        </ul>
      </div>

      {/* 우측 닫기 — 작은 텍스트 한 줄, 아이콘 없음 */}
      <button
        onClick={dismiss}
        className="flex items-center px-3 text-[10px] leading-tight text-white/35 transition-colors hover:text-white/80"
        aria-label="오늘 하루 보지 않기"
      >
        <span className="whitespace-pre">{"오늘 하루\n보지 않기 ×"}</span>
      </button>
    </section>
  )
}

function BannerCard({ banner, priority }: { banner: Banner; priority: boolean }) {
  const { emoji, rest } = extractLeadingEmoji(banner.title)
  const gradient = banner.gradient || "from-slate-600 to-slate-800"

  const card = (
    <article
      className={`relative aspect-[3/4] overflow-hidden rounded-md ring-1 ring-white/10 ${
        banner.image_url ? "bg-neutral-800" : `bg-gradient-to-br ${gradient}`
      }`}
    >
      {banner.image_url ? (
        <Image
          src={banner.image_url}
          alt={banner.title}
          fill
          className="object-cover"
          sizes="(min-width: 768px) 120px, 88px"
          priority={priority}
        />
      ) : (
        /* 플레이스홀더 — 이미지 없을 때: 큰 이모지 + 굵은 제목 오버레이 */
        <div className="absolute inset-0 flex flex-col items-center justify-between p-2 text-center text-white">
          <div className="flex flex-1 items-center justify-center">
            <span className="text-3xl leading-none sm:text-4xl" aria-hidden="true">
              {emoji || "📢"}
            </span>
          </div>
          <span className="line-clamp-2 text-[10px] leading-tight font-extrabold tracking-tight sm:text-[11px]">
            {rest || banner.title}
          </span>
        </div>
      )}
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
