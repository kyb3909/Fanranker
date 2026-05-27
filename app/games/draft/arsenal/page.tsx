import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "아스널 선수 드래프트",
  description:
    "2003 인비저블부터 2026 현재까지 — 아스널 219명에서 예산 $100으로 나만의 베스트 일레븐.",
}

export default function ArsenalDraftPage() {
  return <DraftGame slug="arsenal" />
}
