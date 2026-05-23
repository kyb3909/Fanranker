import { createAnonClient } from "@/lib/supabase/server"
import { ExploreContent } from "./explore-content"

// ISR 60초 — 어드민에서 채널 추가/토글 시 최대 1분 내 반영.
// 어드민 boards 라우트(POST/PATCH)가 revalidatePath('/explore') 호출하므로 보통 즉시 반영.
export const revalidate = 60

async function fetchExploreData() {
  const supabase = createAnonClient()

  const [categoriesResult, postsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, icon, sort_order, description")
      .eq("is_active", true)
      .is("parent_slug", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("posts")
      .select("id, community_slug, title, vote_count, comment_count, view_count, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(0, 49),
  ])

  return {
    "/api/categories": { categories: categoriesResult.data || [] },
    "/api/posts?sort=new&limit=50": { posts: postsResult.data || [] },
  }
}

export default async function ExplorePage() {
  const fallback = await fetchExploreData()

  return <ExploreContent fallback={fallback} />
}
