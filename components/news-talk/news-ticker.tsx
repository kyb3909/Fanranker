"use client"

import { useEffect, useRef, useState } from "react"
import { Zap } from "lucide-react"
import { NewsTalkBoard } from "./news-talk-board"

export type TickerTag = "live" | "breaking" | "result"

export interface TickerItemDetail {
  summary: string[]
  source: string
  sourceUrl: string
  redditUrl?: string
  thumbnailUrl?: string | null
  mediaType?: "youtube" | "image" | "article" | null
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
  football: [
    { id: "fb-1", tag: "live", text: "손흥민 10호골 달성! EPL 득점 랭킹 5위 등극" },
    {
      id: "fb-2",
      tag: "breaking",
      text: "레알 마드리드, 발렌시아 원정에서 카레라스 결승골로 1-0 승리",
    },
    { id: "fb-3", tag: "result", text: "PSG 4-0 마르세유, 뎀벨레·크바라츠헬리아 멀티골" },
    {
      id: "fb-4",
      tag: "breaking",
      text: "K리그1 개막전: 울산 vs 전북, 대한민국 A매치 소집 명단 발표",
    },
    { id: "fb-5", tag: "result", text: "바이에른 뮌헨 3-1 도르트문트, 김민재 풀타임" },
  ],
  baseball: [
    { id: "bb-1", tag: "breaking", text: "KBO 시범경기 일정 확정, 2월 28일 개막" },
    { id: "bb-2", tag: "live", text: "김도영, 스프링캠프 첫 실전 타격 3타수 2안타" },
    { id: "bb-3", tag: "result", text: "LG 트윈스 vs 삼성 라이온즈 시범경기 5-3" },
    { id: "bb-4", tag: "breaking", text: "SSG 랜더스, 새 외국인 투수 계약 완료" },
  ],
  basketball: [
    { id: "bk-1", tag: "live", text: "NBA 르브론 제임스 통산 42,000득점 달성" },
    { id: "bk-2", tag: "result", text: "KBL 원주 DB vs 서울 SK 87-82" },
    { id: "bk-3", tag: "breaking", text: "허웅, KBL 올스타전 팬투표 1위 선정" },
    { id: "bk-4", tag: "result", text: "NBA 보스턴 셀틱스 112-98 마이애미 히트" },
  ],
  volleyball: [
    { id: "vb-1", tag: "live", text: "V리그 대한항공 vs 현대캐피탈 3세트 진행 중" },
    { id: "vb-2", tag: "result", text: "흥국생명 3-1 GS칼텍스, 이소영 25득점" },
    { id: "vb-3", tag: "breaking", text: "V리그 남자부 플레이오프 일정 확정" },
    { id: "vb-4", tag: "result", text: "OK금융그룹 3-0 삼성화재, 레오 20득점" },
  ],
  game: [
    { id: "gm-1", tag: "result", text: "LCK 스프링 T1 vs GEN 결과: T1 2-1 승리" },
    { id: "gm-2", tag: "live", text: "VCT 퍼시픽 DRX vs PRX 1맵 진행 중" },
    { id: "gm-3", tag: "breaking", text: "T1 페이커, LCK 통산 500승 달성 눈앞" },
    { id: "gm-4", tag: "result", text: "LCK 한화생명 2-0 농심, 제카 MVP" },
  ],
  music: [
    { id: "mu-1", tag: "breaking", text: "아이유 신곡 발매, 음원차트 1위 올킬" },
    { id: "mu-2", tag: "live", text: "코첼라 2026 라인업 공개, 한국 아티스트 다수 포함" },
    { id: "mu-3", tag: "result", text: "이번 주 빌보드 HOT 100 K-POP 진입 현황" },
  ],
  idol: [
    { id: "id-1", tag: "breaking", text: "뉴진스 컴백 확정, 미니 앨범 3월 발매" },
    { id: "id-2", tag: "live", text: "세븐틴 월드투어 서울 공연 실시간" },
    { id: "id-3", tag: "result", text: "에스파 일본 돔 투어 전석 매진" },
  ],
  anime: [
    { id: "an-1", tag: "breaking", text: "귀멸의 칼날 새 시즌 방영일 확정" },
    { id: "an-2", tag: "live", text: "주술회전 완결편 동시 방영 시작" },
    { id: "an-3", tag: "result", text: "이번 분기 신작 애니 인기 투표 결과" },
  ],
  "free-board": [
    { id: "fr-1", tag: "breaking", text: "오늘의 인기글: 스포츠 직관 꿀팁 모음" },
    { id: "fr-2", tag: "live", text: "실시간 인기 토론: 역대 최고의 스포츠 명장면은?" },
    { id: "fr-3", tag: "result", text: "이번 주 베스트 유머글 TOP 5 선정" },
  ],
  movies: [
    { id: "mv-1", tag: "breaking", text: "아카데미 시상식 후보작 발표, 올해의 영화는?" },
    { id: "mv-2", tag: "live", text: "마블 신작 예고편 공개, 팬들 반응 폭발" },
    { id: "mv-3", tag: "result", text: "이번 주 북미 박스오피스 1위 영화 확정" },
  ],
}

interface NewsTickerProps {
  communitySlug: string
}

export function NewsTicker({ communitySlug }: NewsTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selectedItem, setSelectedItem] = useState<TickerItem | null>(null)
  const [tickerItems, setTickerItems] = useState<TickerItem[]>([])
  /**
   * ⚠️ **로딩과 "소식 없음"을 구분한다** (2026-08-25 외부 감사).
   *    종전엔 둘 다 빈 배열이라 화면이 "실시간 소식을 불러오는 중…" 을 **영원히** 띄웠다.
   *    아스날 게시판이 그 상태로 며칠 있었고, 고장인지 아닌지 아무도 알 수 없었다.
   */
  const [loading, setLoading] = useState(true)

  // Fetch real data from API, fallback to mock
  useEffect(() => {
    let cancelled = false

    async function fetchTicker() {
      try {
        const res = await fetch(`/api/community/${communitySlug}/ticker`)
        if (!res.ok) throw new Error("API error")
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

    const run = () => fetchTicker().finally(() => !cancelled && setLoading(false))

    run()
    // Refresh every 5 minutes
    const interval = setInterval(run, 5 * 60 * 1000)
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
    // Cache scrollWidth to avoid forced reflow every frame
    let cachedHalfWidth = el.scrollWidth / 2

    function animate() {
      position += speed
      if (position >= cachedHalfWidth) {
        position = 0
      }
      el!.style.transform = `translateX(-${position}px)`
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    const pause = () => cancelAnimationFrame(animationId)
    const resume = () => {
      animationId = requestAnimationFrame(animate)
    }
    const container = el.parentElement
    // Mouse events (desktop)
    container?.addEventListener("mouseenter", pause)
    container?.addEventListener("mouseleave", resume)
    // Touch events (mobile)
    container?.addEventListener("touchstart", pause, { passive: true })
    container?.addEventListener("touchend", resume, { passive: true })

    // Recalculate cached width on resize
    const onResize = () => {
      cachedHalfWidth = el.scrollWidth / 2
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(animationId)
      container?.removeEventListener("mouseenter", pause)
      container?.removeEventListener("mouseleave", resume)
      container?.removeEventListener("touchstart", pause)
      container?.removeEventListener("touchend", resume)
      window.removeEventListener("resize", onResize)
    }
  }, [tickerItems])

  // 빈 상태도 같은 높이 컨테이너로 유지해 CLS 방지. items 가 mount 직후엔 항상 빈 배열
  // (useEffect 에서 fetch) → return null 하면 skeleton 64px → 0 → 43px 두 번 시프트 발생.
  // 외부 구조 유지하고 안쪽만 invisible 로 자리 잡아둠.
  if (tickerItems.length === 0) {
    // 높이는 동일하게 유지해 CLS 방지(return null 하면 64→0→43 두 번 시프트).
    // ⚠️ 문구는 **상태에 따라 다르다.** 소식이 없는데 "불러오는 중"이라고 하면
    //    고장으로 읽힌다 — 실제로 그렇게 읽혔다.
    return (
      <div
        className="w-full overflow-hidden border-b border-neutral-800 bg-neutral-900"
        aria-hidden
      >
        <div className="container mx-auto flex min-h-11 max-w-[1280px] items-center gap-2 px-4 py-2.5 sm:min-h-0">
          <Zap className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="text-[12px] font-bold tracking-wide text-white">LIVE</span>
          <span className="truncate text-[12px] text-neutral-400">
            {loading ? "실시간 소식을 불러오는 중…" : "지금은 새 소식이 없습니다"}
          </span>
        </div>
      </div>
    )
  }

  const items = [...tickerItems, ...tickerItems]

  return (
    <>
      <div className="w-full overflow-hidden border-b border-neutral-800 bg-neutral-900">
        <div className="container mx-auto flex max-w-[1280px] items-center">
          {/* LIVE 뱃지 - 고정 */}
          <div className="z-10 flex shrink-0 items-center gap-1.5 border-r border-neutral-700 px-4 py-2.5">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-[12px] font-bold tracking-wide text-white">LIVE</span>
            <span className="relative flex h-2 w-2">
              <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
            </span>
          </div>

          {/* 스크롤 영역 */}
          <div className="flex-1 overflow-hidden py-2.5">
            <div
              ref={scrollRef}
              className="flex items-center gap-10 whitespace-nowrap will-change-transform"
            >
              {items.map((item, i) => (
                <button
                  key={`${item.id}-${i}`}
                  onClick={() => setSelectedItem(item)}
                  className="group inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 border-none bg-transparent p-0 sm:min-h-0"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                  <span className="text-[14px] font-medium text-neutral-300 transition-colors group-hover:text-white">
                    {item.text}
                  </span>
                </button>
              ))}
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
