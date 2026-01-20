import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/admin'
import { TokenMonitoringTable } from './token-table'

export const dynamic = 'force-dynamic'

export default async function AdminTokensPage() {
  try {
    await requireAdmin()
  } catch (error) {
    redirect('/')
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">토큰 모니터링</h1>
        <p className="text-muted-foreground">모든 사용자의 사이버 토큰 잔액 및 거래 내역을 조회합니다.</p>
      </div>

      <TokenMonitoringTable />
    </div>
  )
}
