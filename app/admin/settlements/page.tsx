import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/admin'
import { SettlementManagementTable } from './settlement-table'

export default async function AdminSettlementsPage() {
  try {
    await requireAdmin()
  } catch (error) {
    redirect('/')
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">정산 처리</h1>
        <p className="text-muted-foreground">완료된 경기의 예측 결과를 정산하고 사용자에게 토큰을 지급합니다.</p>
      </div>

      <SettlementManagementTable />
    </div>
  )
}
