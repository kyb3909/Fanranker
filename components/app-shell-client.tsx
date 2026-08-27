"use client"

import type { ReactNode } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { isStadiumPlayRoute } from "@/lib/stadium/routes"
import { useOnboardingGuard } from "@/hooks/use-onboarding-guard"
import { SiteFooter } from "@/components/site-footer"
import { StadiumPipProvider } from "@/components/metaverse/stadium-pip"

const AnnouncementCarousel = dynamic(
  () =>
    import("@/components/home/announcement-carousel").then((m) => ({
      default: m.AnnouncementCarousel,
    })),
  { ssr: false }
)

interface AppShellClientProps {
  header: ReactNode
  children: ReactNode
}

export function AppShellClient({ header, children }: AppShellClientProps) {
  const pathname = usePathname()
  // admin 은 완전히 자체 레이아웃 (헤더·탭바 전부 제거). 메타버스는 홈페이지
  // 서비스의 일부라 헤더·탭바 유지 — 단 배너는 메인 피드에서만.
  // 경기장 입장(/stadium/{team}/enter)은 걸어다니는 풀스크린 3D 화면이라 헤더가
  // HUD 를 덮는다 — admin 과 같은 취급으로 크롬을 걷는다. 지면이 자체 "지도로"를 준다.
  const isStadiumPlay = isStadiumPlayRoute(pathname)
  const hideChrome = pathname.startsWith("/admin") || isStadiumPlay
  const isHome = pathname === "/"
  // 푸터 — chrome 노출 페이지에만. 풀스크린 다크 캔버스(스타디움·메타버스)는 제외.
  const hideFooter =
    hideChrome || pathname.startsWith("/stadium") || pathname.startsWith("/metaverse")
  // 출시 전 임시 숨김: 헤더에서 내려오는 공지·광고 드롭다운 배너 (캣스날 데모용).
  // 복원 시 → `isHome && !hideChrome` 로 되돌릴 것.
  const showBanner = false && isHome && !hideChrome

  // 로그인됐지만 온보딩 미완료 유저 → /sign-up으로 리다이렉트
  useOnboardingGuard()

  return (
    // .worldcup-scope 글로벌 wrapper — 페이지 전환 시 흰 깜빡임 방지.
    // 각 페이지가 자체 .worldcup-scope wrapper 추가해도 nested cascade 라 안전.
    // /stadium 처럼 자체 dark 배경을 쓰는 페이지는 페이지 내부 div 가 덮어씀.
    // StadiumPipProvider: 스타디움을 전역 상주(미니 플레이어)로 — 라우트 이동에도 연결 유지.
    <StadiumPipProvider>
      <div className="worldcup-scope min-h-screen">
        {/* 본문 바로가기 — 키보드 사용자용 (2026-08-25 외부 감사).
            타깃(`#main-content` + `scroll-margin-top`)은 이미 준비돼 있었는데 **링크만
            없었다**. 그래서 키보드로는 페이지마다 헤더·GNB·검색을 전부 지나야 본문에
            닿았다(홈 기준 20탭 이상).
            ⚠️ `sr-only` 로 숨기고 포커스 시에만 드러낸다 — 마우스 사용자 화면은 무변화. */}
        {!hideChrome && (
          <a
            href="#content-start"
            className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:px-4 focus:py-2 focus:text-[14px] focus:font-bold focus:no-underline"
          >
            본문 바로가기
          </a>
        )}
        {!hideChrome && header}
        {/* 배너 = 피드 위 오버레이 레이어. 홈에서만 절대 위치로 상단 덮개. */}
        {/* min-h-screen: 본문(스트리밍/하이드레이션)이 채워지기 전에도 본문 영역을 뷰포트 높이로
          예약 → footer 가 처음부터 fold 밖. 안 하면 본문이 늦게 자랄 때(특히 홈 피드) footer 가
          밀려 CLS 발생(콜드 로그아웃 포함 ~0.15-0.3, audit:cwv raw 샘플 10/12 스파이크). */}
        {/* ⚠️ 스킵 링크 타깃은 **셸이 소유한다** (2026-08-25).
            페이지 48곳이 각자 `id="main-content"` 를 갖고 있는데, 홈·매치센터·일정·
            승부예측 같은 주요 지면엔 **없다**. 셸에 같은 id 를 또 달면 중복 id 가 되고,
            48곳에서 걷어내는 건 이 작업의 범위를 넘는다. 그래서 셸 전용 앵커를 따로 둔다 —
            페이지가 뭘 갖고 있든 모든 지면에서 링크가 도착한다. */}
        <div id="content-start" tabIndex={-1} className="relative min-h-screen">
          {showBanner && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
              <div className="pointer-events-auto w-full">
                <AnnouncementCarousel />
              </div>
            </div>
          )}
          {children}
        </div>
        {!hideFooter && <SiteFooter />}
      </div>
    </StadiumPipProvider>
  )
}
