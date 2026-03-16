import { createAnonClient } from "@/lib/supabase/server"
import { ExploreContent } from "./explore-content"

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
