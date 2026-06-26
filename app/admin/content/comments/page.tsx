import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { attachNicknames } from "@/lib/admin/attach-nicknames"
import { CommentManagementTable } from "./comment-management-table"

export const metadata: Metadata = { title: "댓글 관리" }
export const dynamic = "force-dynamic"

export default async function AdminCommentsPage() {
  const supabase = createServiceRoleClient()

  // comments↔posts(title) FK 는 정상이지만 comments↔profiles 는 FK 가 없어 임베드 실패
  // (PGRST200) → 닉네임만 attachNicknames 로 별도 병합.
  const { data, count } = await supabase
    .from("comments")
    .select(
      "id, post_id, user_id, content, vote_count, depth, created_at, deleted_at, posts!inner(title)",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(0, 29)

  const comments = await attachNicknames(supabase, data ?? [])

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">댓글 관리</h1>
        <p className="text-muted-foreground text-sm">커뮤니티 댓글을 조회하고 관리합니다.</p>
      </div>
      <CommentManagementTable initialComments={comments} total={count ?? 0} />
    </main>
  )
}
