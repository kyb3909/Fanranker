"use client"

import Link from "@/components/ui/app-link"
import { ArrowUpRight } from "lucide-react"
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

/** 실재하는 라우트만 — 없는 메뉴를 만들지 않는다 */
const SECTIONS: { href: string; label: string }[] = [
  { href: "/explore", label: "운동장" },
  { href: "/prediction", label: "승부예측" },
  { href: "/transfer", label: "이적시장" },
  { href: "/saga", label: "사가" },
  { href: "/gallery", label: "갤러리" },
]

interface CommunityBridgeProps {
  feedTab: FeedTab
  sortBy: SortType
  onTab: (tab: FeedTab) => void
  onSort: (key: SortType) => void
}

export function CommunityBridge({ feedTab, sortBy, onTab, onSort }: CommunityBridgeProps) {
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

        {/* 우: 다른 지면으로 — 담벼락 밖 콘텐츠가 있다는 신호 */}
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-4 overflow-x-auto pb-2 sm:pb-0">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="shrink-0 text-[13px] font-semibold whitespace-nowrap no-underline transition-colors"
              style={{ color: "var(--wc-mute)" }}
            >
              {s.label}
            </Link>
          ))}
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
