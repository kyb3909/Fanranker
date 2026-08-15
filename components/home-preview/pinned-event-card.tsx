"use client"

import Link from "@/components/ui/app-link"
import { ArrowRight } from "lucide-react"
import { GUNNERS_SEASON } from "@/lib/event/gunners-season"

/**
 * 시즌 개막 이벤트 — **오늘의 떡밥 피드 최상단 고정 카드** (2026-08-15 운영자 요청).
 *
 * 종전엔 이 광고가 다크 히어로 맨 위에서 min-h 150px 를 통째로 먹고 있었다. 히어로에는
 * 이미 톱스토리 캐러셀과 오늘의 경기가 있어서, 배너까지 얹히면 **첫 화면이 전부 배너**가
 * 되고 정작 읽을 것(떡밥)은 접힘 아래로 밀린다.
 *
 * 그래서 배너를 밴드에서 빼고(`MatchdayBand hideEventBanner`) 떡밥 목록의 첫 칸으로
 * 내려 붙인다. 떡밥 회전과 무관하게 이벤트 기간 내내 고정이라 노출은 유지되고,
 * 대신 **피드의 한 칸**만 차지한다 — 광고가 콘텐츠 흐름 안에 앉는다.
 *
 * 이벤트가 끝나면(GUNNERS_SEASON.endAt) 스스로 사라진다.
 */
export function PinnedEventCard() {
  if (new Date() >= new Date(GUNNERS_SEASON.endAt)) return null

  return (
    <Link
      href="/season/join?ref=feed-pinned"
      className="relative flex items-stretch overflow-hidden rounded-xl no-underline transition-opacity hover:opacity-95"
      style={{ background: "var(--gn-night-soft, #1a1620)", minHeight: 104 }}
    >
      {/* 좌: 카피 */}
      <div className="relative z-[2] flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-2 pl-4">
        <span className="flex items-center gap-1.5">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-extrabold"
            style={{ background: "var(--wc-burgundy)", color: "#fff" }}
          >
            이벤트
          </span>
          <span
            className="truncate text-[10.5px] font-extrabold uppercase"
            style={{ color: "var(--wc-gold, #ffd96b)", letterSpacing: "0.1em" }}
          >
            Arsenal Only · 2026/27
          </span>
        </span>
        <p
          className="font-title mt-1.5 text-[16px] leading-[1.25] font-bold sm:text-[18px]"
          style={{ color: "var(--gn-cream, #f6f1e8)", wordBreak: "keep-all" }}
        >
          개막 기념 승부예측 이벤트
        </p>
        <p
          className="mt-1 line-clamp-2 text-[12px]"
          style={{ color: "var(--gn-cream-dim, #c9c1b6)", wordBreak: "keep-all" }}
        >
          1등 상품 · 14번 Thierry Henry 사인 유니폼
        </p>
        <span
          className="mt-2 inline-flex w-fit items-center gap-1 text-[12px] font-bold"
          style={{ color: "var(--wc-gold, #ffd96b)" }}
        >
          참가하기
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* 우: 유니폼 사진 — 좌측으로 페이드시켜 카피와 잇는다 */}
      <div className="relative w-[38%] shrink-0 sm:w-[34%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/season/event-banner-henry.webp"
          alt="티에리 앙리 친필 사인 14번 유니폼"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 35%" }}
        />
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, var(--gn-night-soft, #1a1620) 0%, rgba(22,20,26,0.35) 55%, rgba(22,20,26,0) 100%)",
          }}
        />
      </div>
    </Link>
  )
}
