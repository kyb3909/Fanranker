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
    <div className="bg-background min-h-screen">
      <section className="border-border border-b">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
          <Link
            href="/worldcup"
            className="text-muted-foreground hover:text-foreground inline-block text-[13px] transition-colors"
          >
            ← 이벤트 안내로
          </Link>
          <div className="font-title mt-4 mb-3 text-[12px] font-bold tracking-[0.1em] text-amber-600 uppercase dark:text-amber-400">
            LIVE LEADERBOARD
          </div>
          <h1 className="font-title text-foreground text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
            월드컵 이벤트
            <br />
            리더보드
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-[15px] leading-[1.65]">
            그룹 내 적중률·수익률 순위와 그룹 평균으로 가리는 &quot;축잘알 팬덤&quot;. 이벤트 종료
            시 그룹 1위가 결정됩니다.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-4xl px-4 py-10">
          <LeaderboardClient />
        </div>
      </section>
    </div>
  )
}
