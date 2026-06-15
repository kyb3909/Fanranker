import type { Metadata } from "next"
import { MiniGameFrame } from "@/components/games/mini-game-frame"
import { MiniGameLeaderboard } from "@/components/games/mini-game-leaderboard"

export const metadata: Metadata = {
  title: "론도",
  description: "수비는 공을 쫓고, 패스는 길을 만듭니다. 한 번의 실수면 끝나는 론도 스코어 어택.",
}

export default function RondoPage() {
  return (
    <>
      <MiniGameFrame src="/games/rondo.html" title="론도" />
      <MiniGameLeaderboard game="rondo" />
    </>
  )
}
