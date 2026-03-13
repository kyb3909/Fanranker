import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "드래프트 게임",
  description: "스네이크 드래프트로 나만의 드림팀을 만들어보세요.",
}

export default function GamesDraftPage() {
  return <DraftGame />
}
