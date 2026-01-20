import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ExpertApprovalTable } from './expert-approval-table'

export default async function AdminExpertsPage() {
  try {
    await requireAdmin()
  } catch (error) {
    redirect('/')
  }

  const supabase = await createClient()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_url, is_expert, expert_certified_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">전문가 승인 관리</h1>
        <p className="text-muted-foreground">사용자의 전문가 인증을 승인하거나 해제할 수 있습니다.</p>
      </div>

      <ExpertApprovalTable initialProfiles={profiles || []} />
    </div>
  )
}
