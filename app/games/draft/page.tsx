import type { Metadata } from "next"
import { GameSelectScreen } from "@/components/draft/game-select-screen"

export const metadata: Metadata = {
  title: "드래프트 게임",
  description: "한정된 예산으로 선수를 고르고, 나만의 드림팀을 만들어보세요.",
}

export default function GamesDraftPage() {
  return <GameSelectScreen />
}
