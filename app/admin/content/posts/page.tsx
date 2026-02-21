import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { PostManagementTable } from './post-management-table'

export const metadata: Metadata = { title: "게시글 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminPostsPage() {
  const supabase = createServiceRoleClient()

  const { data, count } = await supabase
    .from('posts')
    .select('id, user_id, title, community_slug, view_count, vote_count, comment_count, is_notice, created_at, deleted_at, profiles!inner(nickname)', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, 29)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">게시글 관리</h1>
        <p className="text-sm text-muted-foreground">커뮤니티 게시글을 조회하고 관리합니다.</p>
      </div>
      <PostManagementTable initialPosts={data ?? []} total={count ?? 0} />
    </div>
  )
}
