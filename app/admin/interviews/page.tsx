import type { Metadata } from "next"
import { InterviewReviewManager } from "@/components/admin/interview-review"

export const metadata: Metadata = { title: "인터뷰 카드 검수" }
export const dynamic = "force-dynamic"

/**
 * 인터뷰 발췌 조직 검수 화면 (2026-08-12).
 * 구단 서브레딧 인터뷰 → 발췌(원문 대조 검증) → 번역 → 여기서 승인 →
 * 팀 시즌 사가 연대기 카드. 자동 발행 없음 — 게재는 항상 사람이 결정.
 */
export default function AdminInterviewsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">인터뷰 카드 검수</h1>
        <p className="text-muted-foreground text-sm">
          발췌관이 원문에서 <b>글자 그대로</b> 오려내 대조 검증한 발언만 여기 옵니다. 원문(영어)과
          번역을 비교해 승인하면 팀 시즌 사가 연대기에 실립니다. 발언자·헤드라인 표기가 어색하면
          여기서 고쳐 주세요.
        </p>
      </div>
      <InterviewReviewManager />
    </main>
  )
}
