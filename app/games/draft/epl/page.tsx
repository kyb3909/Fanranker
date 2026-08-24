import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "EPL FPL 드래프트",
  description: "2026/27 FPL 등록 선수 609명. 예산 £70으로 나만의 드림팀 11명을 짜보세요.",
}

export default function EplDraftPage() {
  return <DraftGame slug="epl" />
}
