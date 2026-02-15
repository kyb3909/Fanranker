'use client'

import { useEffect, useRef } from 'react'
import { Zap, Trophy, Flame } from 'lucide-react'
import Link from 'next/link'

type TickerTag = 'live' | 'breaking' | 'result'

interface TickerItem {
  id: string
  tag: TickerTag
  text: string
  href?: string
}

// TODO: 나중에 API 연동 시 이 데이터를 서버에서 가져오도록 변경
const TICKER_ITEMS: TickerItem[] = [
  {
    id: '1',
    tag: 'live',
    text: '손흥민 10호골 달성! EPL 득점 랭킹 5위 등극',
    href: '/community/overseas-football',
  },
  {
    id: '2',
    tag: 'breaking',
    text: '레알 마드리드, 발렌시아 원정에서 카레라스 결승골로 1-0 승리',
    href: '/community/overseas-football',
  },
  {
    id: '3',
    tag: 'result',
    text: 'PSG 4-0 마르세유, 뎀벨레·크바라츠헬리아 멀티골',
    href: '/community/overseas-football',
  },
  {
    id: '4',
    tag: 'breaking',
    text: 'KBO 시범경기 일정 확정, 2월 28일 개막',
    href: '/community/baseball',
  },
  {
    id: '5',
    tag: 'result',
    text: 'LCK 스프링 T1 vs GEN 결과: T1 2-1 승리',
    href: '/community/esports',
  },
]

const TAG_CONFIG: Record<TickerTag, { label: string; className: string }> = {
  live: {
    label: 'LIVE',
    className: 'bg-red-600 text-white',
  },
  breaking: {
    label: '속보',
    className: 'bg-green-600 text-white',
  },
  result: {
    label: '결과',
    className: 'bg-amber-600 text-white',
  },
}

function TagIcon({ tag }: { tag: TickerTag }) {
  const cls = 'w-3.5 h-3.5 text-current'
  switch (tag) {
    case 'live':
      return <Zap className={cls} />
    case 'breaking':
      return <Zap className={cls} />
    case 'result':
      return <Trophy className={cls} />
  }
}

export function NewsTicker() {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let animationId: number
    let position = 0
    const speed = 0.5 // px per frame

    function animate() {
      position += speed
      // 스크롤 폭의 절반(= 원본 1세트 폭)에 도달하면 리셋
      if (el && position >= el.scrollWidth / 2) {
        position = 0
      }
      if (el) {
        el.style.transform = `translateX(-${position}px)`
      }
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    // 호버 시 일시정지
    const pause = () => cancelAnimationFrame(animationId)
    const resume = () => { animationId = requestAnimationFrame(animate) }
    const container = el.parentElement
    container?.addEventListener('mouseenter', pause)
    container?.addEventListener('mouseleave', resume)

    return () => {
      cancelAnimationFrame(animationId)
      container?.removeEventListener('mouseenter', pause)
      container?.removeEventListener('mouseleave', resume)
    }
  }, [])

  // 아이템을 2번 반복해서 무한 스크롤 효과
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]

  return (
    <div className="w-full bg-[#1a1a2e] border-b border-white/10 overflow-hidden">
      <div className="container mx-auto max-w-[1280px] flex items-center">
        {/* LIVE 뱃지 - 고정 */}
        <div className="flex items-center gap-1.5 px-3 py-2 shrink-0 bg-[#1a1a2e] z-10 border-r border-white/10">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white tracking-wide">LIVE</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
        </div>

        {/* 스크롤 영역 */}
        <div className="overflow-hidden flex-1 py-2">
          <div ref={scrollRef} className="flex items-center gap-8 whitespace-nowrap will-change-transform">
            {items.map((item, i) => {
              const tag = TAG_CONFIG[item.tag]
              const content = (
                <span className="inline-flex items-center gap-2">
                  <TagIcon tag={item.tag} />
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tag.className}`}>
                    {tag.label}
                  </span>
                  <span className="text-[13px] text-gray-200 hover:text-white transition-colors">
                    {item.text}
                  </span>
                </span>
              )
              return item.href ? (
                <Link key={`${item.id}-${i}`} href={item.href} className="inline-flex items-center shrink-0">
                  {content}
                </Link>
              ) : (
                <span key={`${item.id}-${i}`} className="inline-flex items-center shrink-0">
                  {content}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
