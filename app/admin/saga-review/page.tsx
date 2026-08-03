import type { Metadata } from "next"
import SagaReviewPage from "@/app/admin2/saga/page"

export const metadata: Metadata = { title: "사가 검수" }
export const dynamic = "force-dynamic"

/**
 * /admin/saga-review — 사가 검수를 기존 어드민 사이드바에서도 연다 (2026-08-04 운영자).
 *
 * /admin2/agg 가 /admin/agg-review 를 감싼 것과 같은 래퍼 패턴(방향만 반대) —
 * 화면 본체는 /admin2/saga 하나뿐이라 한쪽만 고쳐지는 드리프트가 없다.
 * API(/api/admin2/saga)는 requireStaffApi 라 admin 이 당연히 통과한다.
 */
export default function AdminSagaReviewPage() {
  return <SagaReviewPage />
}
