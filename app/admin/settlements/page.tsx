import type { Metadata } from "next"
import { SettlementManagementTable } from './settlement-table'

export const metadata: Metadata = { title: "정산 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminSettlementsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">정산 처리</h1>
        <p className="text-sm text-muted-foreground">완료된 경기의 예측 결과를 정산하고 사용자에게 토큰을 지급합니다.</p>
      </div>
      <SettlementManagementTable />
    </div>
  )
}
