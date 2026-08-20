"use client"

import { memo } from "react"
import Link from "@/components/ui/app-link"
import { useRouter, usePathname } from "next/navigation"
import { CalendarDays, Compass, LayoutGrid, Target } from "lucide-react"

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
  const isPrediction =
    pathname.startsWith("/prediction") ||
    pathname.startsWith("/worldcup") ||
    pathname.startsWith("/season")
  // 경기 허브 — 일정·순위·매치센터가 한 메뉴 아래 (2026-08-19)
  const isMatch =
    pathname.startsWith("/matches") ||
    pathname.startsWith("/match/") ||
    pathname.startsWith("/standings")

  return (
    <nav
      className={inline ? "flex items-center" : "w-full"}
      aria-label="주요 메뉴"
      style={
        inline
          ? undefined
          : {
              background: "var(--wc-card, #ffffff)",
              borderTop: "1px solid var(--wc-line, #e8e5e0)",
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
        {/* 이적시장(/transfer)은 GNB 에서 내리고 축구 게시판 상단 채널 카드로 이동 (2026-07-27) */}
        {/* 승부예측 → **이벤트 페이지**로 (운영자 2026-08-14).
            예측이 이벤트 전용(참가 신청 필요·축구 한정)이 된 뒤로, 메뉴를 누르자마자
            예측 화면이 뜨면 "왜 신청하라는 거지?"에서 헷갈린다. 규칙·상품·참가가 있는
            /season 을 먼저 보여주고, 신청자는 허브의 '오늘 픽하러 가기'로 한 번에 간다. */}
        {/* 경기 — 일정 + 순위 (2026-08-19 운영자: "순위표만 GNB 에 넣기는 좀 그래").
            순위 하나는 한 칸의 무게가 안 되지만 일정·순위·매치센터를 묶으면 된다.
            게다가 /matches 는 만들어 놓고 입구가 홈 밴드 링크 하나뿐이라 죽어 있었다.
            자리는 승부예측 **앞** — 예측하러 오기 전에 보는 참조 정보다. */}
        <Link href="/matches">
          <span className={baseClass} data-on={isMatch ? "true" : undefined}>
            <CalendarDays className="h-[18px] w-[18px] shrink-0" />
            경기
          </span>
        </Link>
        <Link href="/season">
          <span className={baseClass} data-on={isPrediction ? "true" : undefined}>
            <Target className="h-[18px] w-[18px] shrink-0" />
            승부예측
          </span>
        </Link>
        {/*
          NBA 라운지(/nba)는 운영자 결정으로 GNB 미노출 (2026-08-13) — 게시판(농구)만 노출.
          라우트는 유지, 직접 URL 접근 — 10월 NBA 개막 때 노출 재검토.
        */}
        {/*
          축구 타로 — **GNB 에서 완전 제거, 모바일 포함** (2026-08-20 운영자 확정:
          "타로는 이적 기사·경기 일정 같은 문맥에서 점 보는 걸로"). 진입점은 문맥 훅
          3곳뿐이다: 떡밥 카드 타로 띠(cardnews) · 기사 상세(post) · 경기 일정(fixtures)
          — 전부 TarotModal 이라 읽던 지면을 지킨다 (데스크톱 = 980px 큰 루나 무대,
          모바일 = 컴팩트 배치). /tarot 라우트는 딥링크·공유 착지점으로만 유지.
        */}
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
