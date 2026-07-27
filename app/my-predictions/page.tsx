"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { PredictionHistory } from "@/components/my-predictions/prediction-history"
import { SectionHeader } from "@/components/section-header"

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

        {/* 성적 밴드 (시안 A 다크 존) — 기록 카드는 아래 라이트로 유지 */}
        <SectionHeader
          label="My Record"
          title="내 예측"
          description="맞힌 것도 틀린 것도 전부 여기 남는다."
        />

        {/* 마이페이지 "승부예측 내역" = 월드컵 이벤트 기록. 일반 betman 마켓은
            사실상 닫혀 있어 비어 보여 혼란 → 현재 진행 중인 월드컵 이벤트 기록을 노출. */}
        <PredictionHistory eventSlug="worldcup-2026" />
      </main>
    </div>
  )
}
