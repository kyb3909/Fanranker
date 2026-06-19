import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ArrowLeft } from "lucide-react"
import { PredictionHistory } from "@/components/my-predictions/prediction-history"
import { SectionHeader } from "@/components/section-header"

export const metadata: Metadata = {
  title: "내 월드컵 예측 기록",
  description: "월드컵 이벤트 기간 동안의 내 예측 내역",
  robots: { index: false, follow: false },
  alternates: { canonical: "/worldcup/my-predictions" },
}

// 로그인/예측 데이터에 따라 달라지므로 정적 prerender 방지
export const dynamic = "force-dynamic"

export default function WorldcupMyPredictionsPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--wc-paper)" }}>
      <div className="mx-auto max-w-[800px] px-6 pt-10 pb-16">
        <Link
          href="/worldcup/leaderboard"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: "var(--wc-mute)" }}
        >
          <ArrowLeft className="h-4 w-4" /> 리더보드로
        </Link>
        <SectionHeader
          label="WORLD CUP"
          title="내 예측 기록"
          description="월드컵 이벤트 기간 동안의 내 예측 내역입니다."
          style={{ marginTop: 16 }}
        />

        <PredictionHistory eventSlug="worldcup-2026" />
      </div>
    </div>
  )
}
