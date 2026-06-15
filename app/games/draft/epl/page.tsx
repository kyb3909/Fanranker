import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "EPL FPL 드래프트",
  description: "EPL 현역 선수로 즐기는 드래프트. 예산 £80로 나만의 드림팀을 만들어보세요.",
}

export default function EplDraftPage() {
  return <DraftGame slug="epl" />
}
