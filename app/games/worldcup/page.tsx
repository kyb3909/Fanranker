import type { Metadata } from "next"
import { WorldcupPageClient } from "@/components/worldcup/worldcup-page-client"

export const metadata: Metadata = {
  title: "이상형 월드컵",
  description: "토너먼트로 최강자를 가려라! 직접 월드컵을 만들 수도 있습니다.",
}

export default function GamesWorldcupPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <WorldcupPageClient />
    </main>
  )
}
