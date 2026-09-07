import type { Metadata } from "next"
import { ReportQueue } from "./report-queue"

export const metadata: Metadata = { title: "신고 관리" }
export const dynamic = "force-dynamic"

/**
 * 신고 관리.
 *
 * 종전에는 이 서버 컴포넌트가 최신 30건을 직접 조회하고(error 는 읽지도 않았다) 클라이언트가
 * 또 다른 조회를 했다. 두 경로가 갈려서 "조회 실패 = 신고 없음"이 됐다. 이제 조회는
 * `/api/admin/content/reports` **한 곳**만 쓰고, 화면 상태(상태·정렬·페이지)는 URL 이 갖는다 —
 * 상세를 보고 돌아와도 보던 목록으로 복귀한다.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">신고 관리</h1>
        <p className="text-muted-foreground text-sm">
          신고를 검토하고 판정합니다. 인정은 카드 발급으로 이어지므로 실행 전에 효과를 보여줍니다.
        </p>
      </div>
      <ReportQueue
        initialStatus={one(sp.status) ?? "pending"}
        initialSort={one(sp.sort) === "oldest" ? "oldest" : "newest"}
        initialPage={Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1)}
      />
    </main>
  )
}
