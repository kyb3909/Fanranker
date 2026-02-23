import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { UserDirectoryTable } from './user-directory-table'

export const metadata: Metadata = { title: "사용자 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = createServiceRoleClient()

  const { data, count } = await supabase
    .from('profiles')
    .select('user_id, nickname, avatar_url, role, temperature, is_expert, is_artist, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 29)

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">사용자 관리</h1>
        <p className="text-sm text-muted-foreground">전체 사용자 목록을 조회하고 관리합니다.</p>
      </div>
      <UserDirectoryTable initialUsers={data ?? []} total={count ?? 0} />
    </main>
  )
}
