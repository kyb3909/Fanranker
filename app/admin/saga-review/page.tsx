import { redirect } from "next/navigation"

/** 사가 검수는 뉴스 검수에 통합됐다 (2026-08-04 운영자: "검수는 하나로") */
export default function AdminSagaReviewRedirect() {
  redirect("/admin/news-review")
}
