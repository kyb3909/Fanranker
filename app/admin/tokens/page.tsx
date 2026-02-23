import type { Metadata } from "next"
import { TokenMonitoringTable } from './token-table'

export const metadata: Metadata = { title: "토큰 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminTokensPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">토큰 모니터링</h1>
        <p className="text-sm text-muted-foreground">모든 사용자의 사이버 토큰 잔액 및 거래 내역을 조회합니다.</p>
      </div>
      <TokenMonitoringTable />
    </main>
  )
}
