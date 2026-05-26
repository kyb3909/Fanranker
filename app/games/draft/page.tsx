import type { Metadata } from "next"
import { GameSelectScreen } from "@/components/draft/game-select-screen"

export const metadata: Metadata = {
  title: "드래프트 게임",
  description:
    "EPL부터 아스널 레전드, 슬램덩크, 삼국지까지 ― 한정된 예산으로 나만의 드림팀을 만들어보세요.",
}

export default function GamesDraftPage() {
  return <GameSelectScreen />
}
