import type { Metadata } from "next"
import { GamesHub } from "@/components/games/games-hub"

export const metadata: Metadata = {
  title: "게임",
  description: "드래프트, 코너킥 히어로, 패스 서바이버, 론도. 골라서 바로 플레이하세요.",
}

export default function GamesPage() {
  return <GamesHub />
}
