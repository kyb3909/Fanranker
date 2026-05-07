import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { LeaderboardClient } from "@/components/worldcup/leaderboard-client"

export const metadata: Metadata = {
  title: "월드컵 이벤트 리더보드",
  description: "그룹 내 적중률·수익률 순위와 그룹 평균으로 가리는 축잘알 팬덤.",
  alternates: { canonical: "/worldcup/leaderboard" },
}

export default function WorldcupLeaderboardPage() {
  return (
    <div className="px-4 pt-6 pb-16 sm:pt-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <Link href="/worldcup" className="wc-reg-head-back">
            ← 이벤트 안내로
          </Link>
          <div className="wc-sec-eb">LIVE LEADERBOARD</div>
          <h1
            className="font-black tracking-tight"
            style={{
              fontSize: "clamp(28px, 4.5vw, 36px)",
              lineHeight: 1.15,
              color: "var(--wc-ink)",
              letterSpacing: "-0.02em",
            }}
          >
            월드컵 이벤트 리더보드
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--wc-mute)" }}>
            그룹 내 적중률·수익률 순위와 그룹 평균으로 가리는 &ldquo;축잘알 팬덤&rdquo;. 이벤트 종료
            시점에 그룹 1위가 결정됩니다.
          </p>
        </header>

        <LeaderboardClient />
      </div>
    </div>
  )
}
