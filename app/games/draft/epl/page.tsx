import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "EPL FPL 드래프트",
  description:
    "EPL 24-25 시즌 현역으로 스네이크 드래프트. 예산 £80에 나만의 드림팀을 만들어보세요.",
}

export default function EplDraftPage() {
  return <DraftGame />
}
