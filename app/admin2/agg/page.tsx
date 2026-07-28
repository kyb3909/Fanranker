import type { Metadata } from "next"
import Link from "next/link"
import AggReviewPage from "@/app/admin/agg-review/page"

export const metadata: Metadata = { title: "커뮤글 검수" }
export const dynamic = "force-dynamic"

/**
 * /admin2/agg — 기존 커뮤글 검수 화면을 새 작업대 안에서 연다.
 *
 * 왜 래퍼인가: 화면 자체는 이미 잘 돌아가고(31건 규모라 빠른 검수 UI 를 새로 만들 만한
 * 물량이 아니다), 문제는 **위치**뿐이었다. 원본은 /admin 레이아웃 아래라
 * requireAdmin 이 걸려 editor 가 못 들어간다. 여기(/admin2 레이아웃 = requireStaff)로
 * 감싸면 검수 담당이 뉴스와 커뮤글을 한 자리에서 처리할 수 있다.
 *
 * 원본을 그대로 재사용하므로 한쪽만 고쳐지는 일이 없다.
 */
export default function Admin2AggPage() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold">커뮤글 검수</h1>
        <Link href="/admin2" className="text-muted-foreground text-xs hover:underline">
          ← 작업대
        </Link>
      </div>
      <AggReviewPage />
    </div>
  )
}
