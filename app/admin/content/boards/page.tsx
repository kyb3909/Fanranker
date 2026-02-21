import type { Metadata } from "next"
import { createServiceRoleClient } from '@/lib/supabase/server'
import { BoardConfigTable } from './board-config-table'

export const metadata: Metadata = { title: "카테고리 관리" }
export const dynamic = 'force-dynamic'

export default async function AdminBoardsPage() {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">카테고리 관리</h1>
        <p className="text-sm text-muted-foreground">게시판 카테고리를 설정하고 관리합니다.</p>
      </div>
      <BoardConfigTable initialBoards={data ?? []} />
    </div>
  )
}
