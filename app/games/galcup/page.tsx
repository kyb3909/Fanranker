import type { Metadata } from "next"
import { GalcupPageClient } from "@/components/galcup/galcup-page-client"

export const metadata: Metadata = {
  title: "갈드컵",
  description: "댓글로 투표하는 응원 대결! 내 진영에 댓글을 남기면 점수가 올라갑니다.",
}

export default function GamesGalcupPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <GalcupPageClient />
    </main>
  )
}
