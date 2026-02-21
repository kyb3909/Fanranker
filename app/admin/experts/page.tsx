import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ExpertApprovalTable } from './expert-approval-table'

export const metadata: Metadata = { title: "전문가 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminExpertsPage() {
  const supabase = createServiceRoleClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_url, is_expert, expert_certified_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">전문가 승인 관리</h1>
        <p className="text-sm text-muted-foreground">사용자의 전문가 인증을 승인하거나 해제할 수 있습니다.</p>
      </div>
      <ExpertApprovalTable initialProfiles={profiles || []} />
    </div>
  )
}
