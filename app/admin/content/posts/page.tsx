import type { Metadata } from "next"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { attachNicknames } from "@/lib/admin/attach-nicknames"
import { PostManagementTable } from "./post-management-table"

export const metadata: Metadata = { title: "게시글 관리" }
export const dynamic = "force-dynamic"

export default async function AdminPostsPage() {
  const supabase = createServiceRoleClient()

  // posts.user_id ↔ profiles.user_id 는 FK 가 없어 PostgREST 임베드(profiles!inner) 가
  // PGRST200 으로 실패 → 빈 목록. 닉네임은 별도 조회 후 병합한다.
  const { data, count } = await supabase
    .from("posts")
    .select(
      "id, user_id, title, community_slug, view_count, vote_count, comment_count, is_notice, created_at, deleted_at",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(0, 29)

  const posts = await attachNicknames(supabase, data ?? [])

  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">게시글 관리</h1>
        <p className="text-muted-foreground text-sm">커뮤니티 게시글을 조회하고 관리합니다.</p>
      </div>
      <PostManagementTable initialPosts={posts} total={count ?? 0} />
    </main>
  )
}
