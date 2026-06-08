import type { Metadata } from "next"
import { GameSelectScreen } from "@/components/draft/game-select-screen"

export const metadata: Metadata = {
  title: "드래프트 게임",
  description: "아스널 선수 드래프트 ― 한정된 예산으로 나만의 드림팀을 만들어보세요.",
}

export default function GamesDraftPage() {
  return <GameSelectScreen />
}
