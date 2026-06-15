import type { Metadata } from "next"
import { MiniGameFrame } from "@/components/games/mini-game-frame"
import { MiniGameLeaderboard } from "@/components/games/mini-game-leaderboard"

export const metadata: Metadata = {
  title: "패스 서바이버",
  description: "몰려오는 수비 사이에서 패스로 버티는 90분 생존 챌린지. 빠른 패스가 곧 무기입니다.",
}

export default function PassSurvivorPage() {
  return (
    <>
      <MiniGameFrame src="/games/pass-survivor.html" title="패스 서바이버" />
      <MiniGameLeaderboard game="pass-survivor" />
    </>
  )
}
