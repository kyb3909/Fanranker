import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "아스널 레전드 드래프트",
  description:
    "1971 더블부터 2024 인비저블까지 — 아스널 219명에서 예산 $100으로 나만의 올타임 베스트 일레븐.",
}

export default function ArsenalDraftPage() {
  return <DraftGame />
}
