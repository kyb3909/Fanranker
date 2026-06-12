import type { Metadata } from "next"
import { MiniGameFrame } from "@/components/games/mini-game-frame"
import { MiniGameLeaderboard } from "@/components/games/mini-game-leaderboard"

export const metadata: Metadata = {
  title: "패스 서바이버",
  description:
    "떼로 몰려오는 수비 사이에서 90분을 버텨라. 빠른 공은 무기다 — 약한 패스는 헌납이다.",
}

export default function PassSurvivorPage() {
  return (
    <>
      <MiniGameFrame src="/games/pass-survivor.html" title="패스 서바이버" />
      <MiniGameLeaderboard game="pass-survivor" />
    </>
  )
}
