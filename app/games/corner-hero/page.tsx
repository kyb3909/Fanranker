import type { Metadata } from "next"
import { MiniGameFrame } from "@/components/games/mini-game-frame"
import { MiniGameLeaderboard } from "@/components/games/mini-game-leaderboard"

export const metadata: Metadata = {
  title: "코너킥 히어로",
  description:
    "공이 올라오는 단 몇 초 — 자리싸움 · 타이밍 · 코스가 전부다. 코너킥 10회 헤더 챌린지.",
}

export default function CornerHeroPage() {
  return (
    <>
      <MiniGameFrame src="/games/corner-hero.html" title="코너킥 히어로" />
      <MiniGameLeaderboard game="corner-hero" />
    </>
  )
}
