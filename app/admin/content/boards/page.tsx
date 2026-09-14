import { requireAdminPageAccess } from "@/lib/admin/page-access"
import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { BoardConfigTable } from "./board-config-table"

export const metadata: Metadata = { title: "카테고리 관리" }
export const dynamic = "force-dynamic"

export default async function AdminBoardsPage() {
  await requireAdminPageAccess("/admin/content/boards")
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">카테고리 관리</h1>
        <p className="text-muted-foreground text-sm">게시판 카테고리를 설정하고 관리합니다.</p>
      </div>
      <BoardConfigTable initialBoards={data ?? []} />
    </main>
  )
}
