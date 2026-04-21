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
const ANIMATION_MS = 280

function extractLeadingEmoji(title: string): { emoji: string | null; rest: string } {
  const trimmed = title.trimStart()
  const match = trimmed.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u)
  if (!match) return { emoji: null, rest: trimmed }
  return { emoji: match[1], rest: trimmed.slice(match[0].length).trim() }
}

export function AnnouncementCarousel({ initialBanners }: { initialBanners?: unknown[] }) {
  // null = dismissal 체크 전 (SSR/초기), true = 숨김, false = 보임
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [visible, setVisible] = useState(false)

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

  // 최초 마운트 시 "헤더에서 내려오는" 진입 애니메이션 트리거.
  useEffect(() => {
    if (dismissed === false && banners.length > 0) {
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
  }, [dismissed, banners.length])

  const close = (hideForToday: boolean) => {
    setVisible(false) // 위로 접힘 애니메이션 시작
    if (hideForToday) {
      const midnight = new Date()
      midnight.setHours(24, 0, 0, 0)
      localStorage.setItem(STORAGE_KEY, String(midnight.getTime()))
    }
    setTimeout(() => setDismissed(true), ANIMATION_MS)
  }

  if (dismissed === null || dismissed || banners.length === 0) return null

  return (
    <section
      aria-label="공지 · 광고 배너"
      className={`grid overflow-hidden transition-all duration-300 ease-out ${
        visible
          ? "translate-y-0 [grid-template-rows:1fr] opacity-100"
          : "-translate-y-1 [grid-template-rows:0fr] opacity-0"
      }`}
    >
      <div className="min-h-0">
        {/* 네모난 배너 (rounded 없음) — nav에 딱 붙는 직각 레이어 */}
        <div className="overflow-hidden bg-neutral-950 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.35)]">
          {/* 썸네일 스트립 */}
          <div className="overflow-x-auto pt-2.5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="mx-auto flex w-fit snap-x snap-mandatory gap-1.5 px-2">
              {banners.map((b, i) => (
                <li
                  key={b.id}
                  className="w-[88px] flex-shrink-0 snap-start sm:w-[104px] md:w-[120px]"
                >
                  <BannerCard banner={b} priority={i === 0} />
                </li>
              ))}
            </ul>
          </div>

          {/* 하단 컨트롤 바 — 진한 회색 레이어로 구분, 우측 정렬 입체 버튼 2개 */}
          <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-neutral-800/80 px-3 py-1.5 sm:px-4">
            <ControlButton onClick={() => close(false)} ariaLabel="닫기">
              닫기 <span aria-hidden>×</span>
            </ControlButton>
            <ControlButton onClick={() => close(true)} ariaLabel="오늘 하루 보지 않기">
              오늘 하루 보지 않기
            </ControlButton>
          </div>
        </div>
      </div>
    </section>
  )
}

/** 입체 버튼 — 내부 상단 하이라이트 + 하단 드롭섀도 + active 눌림 */
function ControlButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        "rounded-md border border-white/15 bg-gradient-to-b from-neutral-600 to-neutral-700",
        "px-3 py-1 text-center text-[11px] leading-tight font-semibold whitespace-nowrap text-white",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_1px_2px_rgba(0,0,0,0.5)]",
        "transition-all hover:from-neutral-500 hover:to-neutral-600",
        "active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
      ].join(" ")}
    >
      {children}
    </button>
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
