import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/admin'
import { MatchManagementTable } from './match-table'

export default async function AdminMatchesPage() {
  try {
    await requireAdmin()
  } catch (error) {
    redirect('/')
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">경기 관리</h1>
        <p className="text-muted-foreground">예측된 경기 목록을 조회하고 관리합니다.</p>
      </div>

      <MatchManagementTable />
    </div>
  )
}
