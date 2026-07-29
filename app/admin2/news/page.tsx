import type { Metadata } from "next"
import NewsReviewPage from "@/app/admin/news-review/page"

export const metadata: Metadata = { title: "뉴스 검수" }
export const dynamic = "force-dynamic"

/**
 * /admin2/news — 뉴스 검수를 새 작업대 안에서 연다.
 *
 * 화면 본체는 `/admin/news-review` 에 있다(원래 자리). 여기서 만든 개선을 원본에
 * 합쳤으므로 두 경로가 **같은 화면을 공유**한다 — 한쪽만 고쳐지는 일이 없다.
 * /admin2 레이아웃(requireStaff)을 타므로 editor 도 들어올 수 있다는 점만 다르다.
 */
export default function Admin2NewsPage() {
  return <NewsReviewPage />
}
