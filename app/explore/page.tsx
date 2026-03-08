import { createAnonClient } from "@/lib/supabase/server"
import { ExploreContent } from "./explore-content"

async function fetchExploreData() {
  const supabase = createAnonClient()
  const sinceDays = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [categoriesResult, popularResult, recommendedResult, commentedResult, viewedResult] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, slug, name, icon, sort_order, description")
        .eq("is_active", true)
        .is("parent_slug", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("posts")
        .select(
          "id, user_id, community_slug, title, content, image, vote_count, comment_count, temperature, created_at"
        )
        .is("deleted_at", null)
        .gte("created_at", sinceDays)
        .order("temperature", { ascending: false, nullsFirst: false })
        .range(0, 9),
      supabase
        .from("posts")
        .select(
          "id, user_id, community_slug, title, content, image, vote_count, comment_count, view_count, temperature, created_at"
        )
        .is("deleted_at", null)
        .gte("created_at", sinceDays)
        .order("vote_count", { ascending: false })
        .range(0, 4),
      supabase
        .from("posts")
        .select(
          "id, user_id, community_slug, title, content, image, vote_count, comment_count, view_count, temperature, created_at"
        )
        .is("deleted_at", null)
        .gte("created_at", sinceDays)
        .order("comment_count", { ascending: false })
        .range(0, 4),
      supabase
        .from("posts")
        .select(
          "id, user_id, community_slug, title, content, image, vote_count, comment_count, view_count, temperature, created_at"
        )
        .is("deleted_at", null)
        .gte("created_at", sinceDays)
        .order("view_count", { ascending: false })
        .range(0, 4),
    ])

  // 프로필 조회를 위해 모든 user_id 수집
  const allPosts = [
    ...(popularResult.data || []),
    ...(recommendedResult.data || []),
    ...(commentedResult.data || []),
    ...(viewedResult.data || []),
  ]
  const userIds = [...new Set(allPosts.map((p) => p.user_id))]

  let profiles: {
    user_id: string
    nickname: string
    avatar_url: string | null
    temperature: number | null
  }[] = []
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, temperature")
      .in("user_id", userIds)
    profiles = data || []
  }

  const makeFallback = (posts: typeof allPosts) => ({ posts: posts || [], profiles })

  return {
    "/api/categories": { categories: categoriesResult.data || [] },
    "/api/posts?sort=hot&limit=10": makeFallback(popularResult.data || []),
    "/api/posts?sort=votes&limit=5": makeFallback(recommendedResult.data || []),
    "/api/posts?sort=comments&limit=5": makeFallback(commentedResult.data || []),
    "/api/posts?sort=views&limit=5": makeFallback(viewedResult.data || []),
  }
}

export default async function ExplorePage() {
  const fallback = await fetchExploreData()

  return <ExploreContent fallback={fallback} />
}
