import type { Metadata } from "next"
import { PredictionPageClient } from "@/components/prediction-page-client"

export const metadata: Metadata = {
  title: "승부예측",
  description: "프로토 승부예측으로 실력을 겨루세요",
}

export default function GamesPredictionPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <PredictionPageClient />
    </main>
  )
}
