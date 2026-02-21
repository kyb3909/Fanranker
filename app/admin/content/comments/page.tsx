import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { CommentManagementTable } from './comment-management-table'

export const metadata: Metadata = { title: "댓글 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminCommentsPage() {
  const supabase = createServiceRoleClient()

  const { data, count } = await supabase
    .from('comments')
    .select('id, post_id, user_id, content, vote_count, depth, created_at, deleted_at, profiles!inner(nickname), posts!inner(title)', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, 29)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">댓글 관리</h1>
        <p className="text-sm text-muted-foreground">커뮤니티 댓글을 조회하고 관리합니다.</p>
      </div>
      <CommentManagementTable initialComments={data ?? []} total={count ?? 0} />
    </div>
  )
}
