import type { Metadata } from "next"
import { DraftGame } from "@/components/draft/draft-game"

export const metadata: Metadata = {
  title: "아스널 선수 드래프트",
  description:
    "2003 인빈시블부터 2026 현재까지, 예산 $100으로 아스널 베스트 일레븐을 만들어보세요.",
}

export default function ArsenalDraftPage() {
  return <DraftGame slug="arsenal" />
}
