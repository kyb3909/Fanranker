"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { PredictionHistory } from "@/components/my-predictions/prediction-history"

export default function MyPredictionsPage() {
  const router = useRouter()
  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main id="main-content" className="mx-auto max-w-[800px] px-4 py-6" tabIndex={-1}>
        {/* 미니 헤더 — 뒤로가기만 */}
        <div className="mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            style={{ color: "var(--wc-mute)" }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        <PredictionHistory />
      </main>
    </div>
  )
}
