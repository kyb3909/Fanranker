import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ReportQueue } from './report-queue'

export const metadata: Metadata = { title: "신고 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = createServiceRoleClient()

  const { data, count } = await supabase
    .from('content_reports')
    .select('*', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .range(0, 29)

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">신고 관리</h1>
        <p className="text-sm text-muted-foreground">사용자 신고를 검토하고 처리합니다.</p>
      </div>
      <ReportQueue initialReports={data ?? []} total={count ?? 0} />
    </main>
  )
}
