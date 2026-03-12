import { Suspense } from "react"
import { createAnonClient } from "@/lib/supabase/server"
import { HomeClient } from "@/components/home/home-client"
import type { PostsResponse } from "@/hooks/use-feed"

/**
 * 홈 페이지 (Server Component)
 *
 * 서버에서 초기 피드 데이터를 미리 가져와 SSR로 렌더링.
 * JS가 로드되기 전에도 게시물 목록이 보여 Speed Index가 크게 개선됨.
 */
async function fetchInitialFeed(): Promise<PostsResponse> {
  try {
    const supabase = createAnonClient()

    const { data: posts, error } = await supabase
      .from("posts")
      .select(
        "id, user_id, community_slug, title, content, image, vote_count, comment_count, temperature, created_at"
      )
      .is("deleted_at", null)
      .order("temperature", { ascending: false, nullsFirst: false })
      .range(0, 19)

    if (error || !posts || posts.length === 0) {
      return { posts: [], profiles: [] }
    }

    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const [{ data: profiles }, { data: equippedTitles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url, temperature")
        .in("user_id", userIds),
      supabase
        .from("user_equipped_titles")
        .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
        .in("user_id", userIds),
    ])

    return {
      posts,
      profiles: profiles || [],
      equippedTitles: (equippedTitles || []) as unknown as PostsResponse["equippedTitles"],
      hasMore: posts.length === 20,
    }
  } catch {
    return { posts: [], profiles: [] }
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [params, initialFeed] = await Promise.all([searchParams, fetchInitialFeed()])

  return (
    <Suspense>
      <HomeClient initialFeed={initialFeed} isPredictionView={params.view === "prediction"} />
    </Suspense>
  )
}
