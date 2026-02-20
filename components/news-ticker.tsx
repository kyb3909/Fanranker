'use client'

import { useEffect, useRef, useState } from 'react'
import { Zap, Trophy } from 'lucide-react'
import { NewsTalkBoard } from './news-talk-board'

export type TickerTag = 'live' | 'breaking' | 'result'

export interface TickerItemDetail {
  summary: string[]
  source: string
  sourceUrl: string
  redditUrl?: string
  participants: number
  score?: number
  category?: string
  importance?: number
  postedAt?: string
  originalTitle?: string
}

export interface TickerItem {
  id: string
  tag: TickerTag
  text: string
  detail?: TickerItemDetail
}

// 게시판별 틱커 데이터 (폴백 목업)
const COMMUNITY_TICKER_ITEMS: Record<string, TickerItem[]> = {
  'overseas-football': [
    { id: 'of-1', tag: 'live', text: '손흥민 10호골 달성! EPL 득점 랭킹 5위 등극' },
    { id: 'of-2', tag: 'breaking', text: '레알 마드리드, 발렌시아 원정에서 카레라스 결승골로 1-0 승리' },
    { id: 'of-3', tag: 'result', text: 'PSG 4-0 마르세유, 뎀벨레·크바라츠헬리아 멀티골' },
    { id: 'of-4', tag: 'breaking', text: '맨시티, 하이두크 스플리트 상대 챔스 16강 진출 확정' },
    { id: 'of-5', tag: 'result', text: '바이에른 뮌헨 3-1 도르트문트, 김민재 풀타임' },
  ],
  'domestic-football': [
    { id: 'df-1', tag: 'live', text: 'K리그1 2025 시즌 개막전: 울산 vs 전북' },
    { id: 'df-2', tag: 'breaking', text: '대한민국 A매치 소집 명단 발표, 이강인·손흥민 포함' },
    { id: 'df-3', tag: 'result', text: 'FC서울 2-0 수원FC, 주민규 시즌 첫 골' },
    { id: 'df-4', tag: 'breaking', text: '제주 유나이티드, 외국인 공격수 영입 공식 발표' },
  ],
  'baseball': [
    { id: 'bb-1', tag: 'breaking', text: 'KBO 시범경기 일정 확정, 2월 28일 개막' },
    { id: 'bb-2', tag: 'live', text: '김도영, 스프링캠프 첫 실전 타격 3타수 2안타' },
    { id: 'bb-3', tag: 'result', text: 'LG 트윈스 vs 삼성 라이온즈 시범경기 5-3' },
    { id: 'bb-4', tag: 'breaking', text: 'SSG 랜더스, 새 외국인 투수 계약 완료' },
  ],
  'basketball': [
    { id: 'bk-1', tag: 'live', text: 'NBA 르브론 제임스 통산 42,000득점 달성' },
    { id: 'bk-2', tag: 'result', text: 'KBL 원주 DB vs 서울 SK 87-82' },
    { id: 'bk-3', tag: 'breaking', text: '허웅, KBL 올스타전 팬투표 1위 선정' },
    { id: 'bk-4', tag: 'result', text: 'NBA 보스턴 셀틱스 112-98 마이애미 히트' },
  ],
  'volleyball': [
    { id: 'vb-1', tag: 'live', text: 'V리그 대한항공 vs 현대캐피탈 3세트 진행 중' },
    { id: 'vb-2', tag: 'result', text: '흥국생명 3-1 GS칼텍스, 이소영 25득점' },
    { id: 'vb-3', tag: 'breaking', text: 'V리그 남자부 플레이오프 일정 확정' },
    { id: 'vb-4', tag: 'result', text: 'OK금융그룹 3-0 삼성화재, 레오 20득점' },
  ],
  'esports': [
    { id: 'es-1', tag: 'result', text: 'LCK 스프링 T1 vs GEN 결과: T1 2-1 승리' },
    { id: 'es-2', tag: 'live', text: 'VCT 퍼시픽 DRX vs PRX 1맵 진행 중' },
    { id: 'es-3', tag: 'breaking', text: 'T1 페이커, LCK 통산 500승 달성 눈앞' },
    { id: 'es-4', tag: 'result', text: 'LCK 한화생명 2-0 농심, 제카 MVP' },
  ],
  'free-board': [
    { id: 'fb-1', tag: 'breaking', text: '오늘의 인기글: 스포츠 직관 꿀팁 모음' },
    { id: 'fb-2', tag: 'live', text: '실시간 인기 토론: 역대 최고의 스포츠 명장면은?' },
    { id: 'fb-3', tag: 'result', text: '이번 주 베스트 유머글 TOP 5 선정' },
  ],
  'tips': [
    { id: 'tp-1', tag: 'breaking', text: '프리미어리그 26라운드 주요 분석 포인트 업데이트' },
    { id: 'tp-2', tag: 'live', text: '오늘의 분석: KBO 시범경기 주목 포인트' },
    { id: 'tp-3', tag: 'result', text: '지난주 적중률 TOP 분석가 발표' },
  ],
}

const TAG_CONFIG: Record<TickerTag, { label: string; className: string; iconClassName: string }> = {
  live: {
    label: 'LIVE',
    className: 'bg-red-600 text-white',
    iconClassName: 'text-red-400',
  },
  breaking: {
    label: '속보',
    className: 'bg-amber-500 text-neutral-900 font-bold',
    iconClassName: 'text-amber-400',
  },
  result: {
    label: '결과',
    className: 'bg-rose-900 text-rose-200',
    iconClassName: 'text-rose-400',
  },
}

function TagIcon({ tag }: { tag: TickerTag }) {
  const cls = `w-3.5 h-3.5 ${TAG_CONFIG[tag].iconClassName}`
  switch (tag) {
    case 'live':
      return <Zap className={cls} />
    case 'breaking':
      return <Zap className={cls} />
    case 'result':
      return <Trophy className={cls} />
  }
}

interface NewsTickerProps {
  communitySlug: string
}

export function NewsTicker({ communitySlug }: NewsTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selectedItem, setSelectedItem] = useState<TickerItem | null>(null)
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([])

  // Fetch real data from API, fallback to mock
  useEffect(() => {
    let cancelled = false

    async function fetchTicker() {
      try {
        const res = await fetch(`/api/community/${communitySlug}/ticker`)
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        if (!cancelled && data.items && data.items.length > 0) {
          setTickerItems(data.items)
          return
        }
      } catch {
        // silently fallback
      }
      // Fallback to mock data
      if (!cancelled) {
        setTickerItems(COMMUNITY_TICKER_ITEMS[communitySlug] || [])
      }
    }

    fetchTicker()
    // Refresh every 5 minutes
    const interval = setInterval(fetchTicker, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [communitySlug])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || tickerItems.length === 0) return

    let animationId: number
    let position = 0
    const speed = 0.5

    function animate() {
      position += speed
      if (el && position >= el.scrollWidth / 2) {
        position = 0
      }
      if (el) {
        el.style.transform = `translateX(-${position}px)`
      }
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

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
  }, [tickerItems])

  if (tickerItems.length === 0) return null

  const items = [...tickerItems, ...tickerItems]

  return (
    <>
      <div className="w-full bg-neutral-900 border-b border-neutral-800 overflow-hidden">
        <div className="container mx-auto max-w-[1280px] flex items-center">
          {/* LIVE 뱃지 - 고정 */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0 z-10 border-r border-neutral-700">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-[12px] font-bold text-white tracking-wide">LIVE</span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          </div>

          {/* 스크롤 영역 */}
          <div className="overflow-hidden flex-1 py-2.5">
            <div ref={scrollRef} className="flex items-center gap-10 whitespace-nowrap will-change-transform">
              {items.map((item, i) => {
                const tag = TAG_CONFIG[item.tag]
                return (
                  <button
                    key={`${item.id}-${i}`}
                    onClick={() => setSelectedItem(item)}
                    className="inline-flex items-center shrink-0 gap-2 cursor-pointer bg-transparent border-none p-0 group"
                  >
                    <TagIcon tag={item.tag} />
                    <span className={`text-[11px] px-2 py-0.5 rounded-md ${tag.className}`}>
                      {tag.label}
                    </span>
                    <span className="text-[14px] text-neutral-300 group-hover:text-white font-medium transition-colors">
                      {item.text}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <NewsTalkBoard
          item={selectedItem}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  )
}
