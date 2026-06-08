import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { Countdown } from "@/components/worldcup/countdown"

const GROUPS = {
  gooner: {
    name: "Gooner",
    clubKor: "아스날",
    color: "#EF0107",
    motto: "Victoria Concordia Crescit",
  },
} as const

export const metadata: Metadata = {
  title: "등록 완료 — 월드컵 이벤트",
  description: "월드컵 이벤트 사전 등록을 완료했습니다. 이벤트 시작까지 카운트다운.",
  alternates: { canonical: "/worldcup/register/done" },
  robots: { index: false }, // 직접 URL 접근은 가능하지만 검색엔진 인덱싱 X
}

export default async function RegisterDonePage() {
  const group = GROUPS.gooner

  return (
    <div className="wc-done" style={{ ["--gp" as string]: group.color } as React.CSSProperties}>
      <div className="wc-done-bg">
        <div className="wc-done-orb" />
        <div className="wc-done-grid" />
      </div>

      <div className="wc-done-content">
        <div className="mx-auto max-w-4xl px-4">
          {/* Hero */}
          <header className="wc-done-hero">
            <div className="wc-done-eb">YOU&apos;RE IN</div>
            <h1 className="wc-done-h1">
              <span style={{ color: group.color }}>{group.name}</span> 합류 완료
            </h1>
            <p className="wc-done-tagline">&ldquo;{group.motto}&rdquo;</p>
            <p className="wc-done-sub">
              아스날 구너로 합류했어요. 월드컵 시작일에 알림 보내드릴게요. 그동안 리더보드를
              둘러보세요.
            </p>
            <div className="wc-done-cd-wrap">
              <Countdown target="2026-06-11T00:00:00+09:00" label="이벤트 시작까지" />
            </div>
          </header>

          {/* Action cards */}
          <div className="wc-done-cards">
            <div className="wc-done-card">
              <div className="wc-done-card-h">구너 현황 보기</div>
              <p className="wc-done-card-b">구너 전체 평균과 내 위치를 확인하세요.</p>
              <Link href="/worldcup/leaderboard" className="wc-done-card-cta">
                현황 보기 →
              </Link>
            </div>
            <div className="wc-done-card">
              <div className="wc-done-card-h">친구 초대</div>
              <p className="wc-done-card-b">구너 친구를 데려오면 구너 평균이 올라갑니다.</p>
              <Link href="/worldcup" className="wc-done-card-cta">
                안내 페이지 공유
              </Link>
            </div>
            <div className="wc-done-card">
              <div className="wc-done-card-h">이벤트 안내로</div>
              <p className="wc-done-card-b">일정·규칙·진행 방식을 다시 확인하세요.</p>
              <Link href="/worldcup" className="wc-done-card-cta">
                안내로 가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
