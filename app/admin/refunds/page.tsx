import type { Metadata } from "next"
import { RefundQueue } from "./refund-queue"

export const metadata: Metadata = { title: "환불 큐" }
export const dynamic = "force-dynamic"

/**
 * 환불 큐 — 자동 환불이 실패해 남은 **미지급 의무** 목록.
 *
 * 조회는 `/api/admin/refunds` 한 곳만 쓴다(종전에는 서버·클라이언트가 각자 조회해
 * 실패가 빈 목록으로 보였다). 화면 상태는 URL 이 갖는다.
 */
export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">환불 큐</h1>
        <p className="text-muted-foreground text-sm">
          자동 환불이 실패해 사용자에게 아직 돌아가지 않은 볼·골드입니다. 볼은 자동 재시도가 되지만,
          골드는 다른 경로로 직접 지급한 뒤 기록해야 합니다.
        </p>
      </div>
      <RefundQueue
        initialStatus={one(sp.status) ?? "pending"}
        initialSort={one(sp.sort) === "oldest" ? "oldest" : "newest"}
        initialPage={Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1)}
      />
    </main>
  )
}
