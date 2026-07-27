"use client"

import { memo } from "react"
import Link from "@/components/ui/app-link"
import { useRouter, usePathname } from "next/navigation"
import { Compass, LayoutGrid, Crown } from "lucide-react"

// 시안 .hdr-link 패턴 — 흰 배경 nav, off=mute, on=burgundy fill.
// scope-free 하게 var(--wc-*) + hex fallback 사용 → AppShell 어디서나 동작.
const baseClass =
  "wc-hdr-link relative inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 font-sans text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors sm:gap-1.5 sm:px-3 sm:text-[14px]"

interface HeaderNavProps {
  /**
   * inline=true: 헤더 한 행 안에 인라인 배치 (시안 .hdr-nav).
   * inline=false (default): 헤더 아래 별도 row (외곽 흰 카드 + top border).
   */
  inline?: boolean
}

export const HeaderNav = memo(function HeaderNav({ inline = false }: HeaderNavProps) {
  const router = useRouter()
  const pathname = usePathname()

  const isFeed = pathname === "/"
  const isExplore = pathname.startsWith("/explore") || pathname.startsWith("/community")
  const isWorldcup = pathname.startsWith("/worldcup")

  return (
    <nav
      className={inline ? "flex items-center" : "w-full"}
      aria-label="주요 메뉴"
      style={
        inline
          ? undefined
          : {
              background: "var(--wc-card, #ffffff)",
              borderTop: "1px solid var(--wc-line, #E2E5EA)",
            }
      }
    >
      {/*
        가로 스크롤 컨테이너에 justify-center 를 쓰면 내용이 넘칠 때 항목들이 양쪽으로
        균등하게 삐져나가, 왼쪽으로 넘친 부분이 음수 스크롤 영역에 들어가 도달 불가
        (맨 왼쪽 아이콘이 잘림). first:ml-auto + last:mr-auto 로 "들어가면 중앙정렬,
        넘치면 왼쪽부터 정상 스크롤" 동작을 얻는다.
      */}
      <div
        className={
          inline
            ? "scrollbar-none flex items-center gap-0.5 overflow-x-auto"
            : "scrollbar-none flex items-center overflow-x-auto [&>:first-child]:ml-auto [&>:last-child]:mr-auto"
        }
      >
        <Link
          href="/"
          scroll={false}
          onClick={(e) => {
            e.preventDefault()
            if (window.location.pathname === "/" && !window.location.search) {
              window.scrollTo({ top: 0, behavior: "auto" })
            } else {
              router.push("/")
              window.scrollTo({ top: 0, behavior: "auto" })
            }
          }}
        >
          <span className={baseClass} data-on={isFeed ? "true" : undefined}>
            <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
            담벼락
          </span>
        </Link>
        {/*
          떡밥(/snack 풀스크린 스와이프)은 홈 오늘의 떡밥 탭과 이름 충돌로 메뉴에서 숨김 (2026-07-27).
          라우트는 유지 — 직접 URL로만 접근 가능.
        */}
        <Link href="/explore">
          <span className={baseClass} data-on={isExplore ? "true" : undefined}>
            <Compass className="h-[18px] w-[18px] shrink-0" />
            운동장
          </span>
        </Link>
        {/*
          경기 예측(/prediction)은 월드컵 이벤트에 집중하기 위해 메뉴에서 숨김.
          라우트(/prediction/*)는 유지 — 직접 URL로만 접근 가능.
        */}
        {/* 이적시장(/transfer)은 GNB 에서 내리고 축구 게시판 상단 채널 카드로 이동 (2026-07-27) */}
        <Link href="/worldcup">
          <span className={baseClass} data-on={isWorldcup ? "true" : undefined}>
            <Crown className="h-[18px] w-[18px] shrink-0" />
            월드컵 이벤트
            <span
              aria-hidden
              className="wc-hdr-pulse ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            />
          </span>
        </Link>
        {/*
          게임(/games)·스타디움(/metaverse/highbury)은 첫인상 단순화를 위해 메뉴에서 숨김 (2026-07-26).
          라우트는 유지 — 직접 URL로만 접근 가능.
        */}
        {/*
          스타디움 메뉴는 가오픈에서 제외 (스프라이트 외주 + Phaser 작업 완료 후 노출).
          라우트(/stadium/*)는 유지 — 직접 URL로만 접근 가능.
          상점은 UserMenu (프로필 드롭다운) 으로 이동 — 메뉴바 컴팩트화.
        */}
      </div>
    </nav>
  )
})
