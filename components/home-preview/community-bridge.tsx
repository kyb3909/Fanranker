"use client"

import Link from "@/components/ui/app-link"
import { usePathname } from "next/navigation"
import { ArrowUpRight, Compass, LayoutGrid, Sparkles, Target } from "lucide-react"
import type { FeedTab } from "@/components/home/home-client"
import type { SortType } from "@/hooks/use-feed"

/**
 * Bridge — 다크 히어로와 커뮤니티 지면을 잇는 띠 (홈 리디자인 프리뷰, 2026-08-15).
 *
 * 왜 필요한가: 지금 홈은 히어로가 끝나는 지점에서 배경·폭·밀도가 한꺼번에 바뀌어
 * "두 사이트를 위아래로 붙인 것"처럼 읽힌다. 그 이음매에 **두 존에 동시에 걸친 요소**를
 * 하나 놓으면 경계가 사건이 아니라 전환으로 읽힌다 — 그래서 히어로 하단에 24px 걸친다
 * (`.gnp-bridge { margin-top: -24px }`).
 *
 * ⚠️ 장식이 아니다. 왼쪽은 **실제 피드 탭 상태**(오늘의 떡밥/담벼락/오늘의 경기)를 쥐고,
 *    오른쪽은 실재하는 라우트로만 나간다. 없는 기능을 만들어 붙이지 않았다.
 */

/**
 * 상단 GNB 를 여기로 내렸다 (2026-08-15 운영자: "상단 GNB를 없애고 아이콘을 아래 GNB로").
 *
 * 헤더 2행 nav 와 이 띠가 같이 있으면 **같은 내비게이션이 두 줄**로 보인다. 프리뷰에서는
 * 헤더 쪽을 감추고(components/header/header.tsx) 아이콘·라벨·라우트를 그대로 여기로 옮겼다.
 * ⚠️ 라우트는 header-nav.tsx 와 **같은 값**을 써야 한다 — 승부예측이 /season 인 이유는
 *    예측이 이벤트 전용이 된 뒤 규칙·상품·참가가 있는 허브를 먼저 보여주기 위해서다.
 */
const SECTIONS: {
  href: string
  label: string
  Icon: typeof Compass
  match: (p: string) => boolean
}[] = [
  {
    href: "/",
    label: "담벼락",
    Icon: LayoutGrid,
    match: (p) => p === "/" || p === "/home-preview",
  },
  {
    href: "/explore",
    label: "운동장",
    Icon: Compass,
    match: (p) => p.startsWith("/explore") || p.startsWith("/community"),
  },
  {
    // 이벤트 페이지 폐쇄 동안 /prediction (2026-09-02, header-nav·mobile-tab-bar 와 동일). 재개 시 /season.
    href: "/prediction",
    label: "승부예측",
    Icon: Target,
    match: (p) =>
      p.startsWith("/prediction") || p.startsWith("/worldcup") || p.startsWith("/season"),
  },
  { href: "/tarot", label: "타로", Icon: Sparkles, match: (p) => p.startsWith("/tarot") },
]

interface CommunityBridgeProps {
  feedTab: FeedTab
  sortBy: SortType
  onTab: (tab: FeedTab) => void
  onSort: (key: SortType) => void
}

export function CommunityBridge({ feedTab, sortBy, onTab, onSort }: CommunityBridgeProps) {
  const pathname = usePathname()

  /** 활성 여부만 다르고 형태는 같은 탭 버튼 — 밑줄로 위계를 준다(알약 남발 회피) */
  const tabBtn = (active: boolean) =>
    [
      "relative shrink-0 whitespace-nowrap px-1 pb-2.5 pt-1 text-[14px] font-bold transition-colors",
      active ? "text-[var(--wc-ink)]" : "text-[var(--wc-mute)] hover:text-[var(--wc-ink)]",
    ].join(" ")

  const underline = (active: boolean) =>
    active ? (
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-px h-[3px] rounded-full"
        style={{ background: "var(--gnp-accent)" }}
      />
    ) : null

  return (
    <nav className="gnp-bridge px-4 sm:px-5" aria-label="커뮤니티 내비게이션">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:flex-nowrap">
        {/* 좌: 실제 피드 전환 — 이 띠가 곧 담벼락의 컨트롤이다 */}
        <div
          className="scrollbar-none -mb-px flex items-center gap-5 overflow-x-auto pt-1"
          role="group"
          aria-label="담벼락 보기 선택"
        >
          <button
            onClick={() => onTab("cardnews")}
            aria-pressed={feedTab === "cardnews"}
            className={tabBtn(feedTab === "cardnews")}
          >
            오늘의 떡밥
            {underline(feedTab === "cardnews")}
          </button>
          <button
            onClick={() => onSort(sortBy === "random" ? "random" : "new")}
            aria-pressed={feedTab === "board"}
            className={tabBtn(feedTab === "board")}
          >
            담벼락
            {underline(feedTab === "board")}
          </button>
          <button
            onClick={() => onTab("games")}
            aria-pressed={feedTab === "games"}
            className={tabBtn(feedTab === "games")}
          >
            오늘의 경기
            {underline(feedTab === "games")}
          </button>
        </div>

        <span
          aria-hidden
          className="hidden h-5 w-px shrink-0 sm:block"
          style={{ background: "var(--gnp-line)" }}
        />

        {/* 우: 사이트 주요 메뉴 — 상단 헤더에서 내려온 GNB */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-2 sm:pb-0">
          {SECTIONS.map(({ href, label, Icon, match }) => {
            const on = match(pathname)
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-semibold whitespace-nowrap no-underline transition-colors"
                style={{
                  background: on ? "var(--gnp-accent)" : "transparent",
                  color: on ? "#fff" : "var(--wc-mute)",
                }}
              >
                <Icon className="h-[17px] w-[17px] shrink-0" />
                {label}
              </Link>
            )
          })}
          <Link
            href="/write"
            className="ml-auto hidden shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-bold whitespace-nowrap no-underline sm:inline-flex"
            style={{ background: "var(--gnp-accent)", color: "#fff" }}
          >
            글쓰기
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </nav>
  )
}
