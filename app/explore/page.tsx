import { createAnonClient } from "@/lib/supabase/server"
import { ExploreContent } from "./explore-content"

async function fetchExploreData() {
  const supabase = createAnonClient()

  const [categoriesResult, postsResult, recentCommentsResult] = await Promise.all([
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
    // Minimal Sport RightAside용 — 최근 댓글 달린 게시물
    supabase
      .from("posts")
      .select("id, title, community_slug, comment_count, latest_comment_at, created_at")
      .is("deleted_at", null)
      .gt("comment_count", 0)
      .order("latest_comment_at", { ascending: false, nullsFirst: false })
      .limit(10),
  ])

  return {
    fallback: {
      "/api/categories": { categories: categoriesResult.data || [] },
      "/api/posts?sort=new&limit=50": { posts: postsResult.data || [] },
    },
    recentComments: recentCommentsResult.data || [],
  }
}

export default async function ExplorePage() {
  const data = await fetchExploreData()

  return <ExploreContent fallback={data.fallback} recentComments={data.recentComments} />
}
