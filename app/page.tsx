import { Suspense } from "react"
import { createAnonClient } from "@/lib/supabase/server"
import { HomeClient } from "@/components/home/home-client"
import type { PostsResponse } from "@/hooks/use-feed"

// 홈페이지 ISR: 5분 캐시 + stale-while-revalidate.
// 새 글 작성 시 /api/posts POST가 revalidatePath("/")로 즉시 갱신.
export const revalidate = 300

/**
 * 홈 페이지 (Server Component)
 *
 * 서버에서 피드 + 사이드바 + 배너 데이터를 병렬로 프리페치하여
 * 클라이언트 API 워터폴을 제거. TTFB에 모든 데이터가 포함됨.
 */
async function fetchAllHomeData() {
  const supabase = createAnonClient()

  // 모든 데이터를 병렬로 가져오기
  const [feedResult, categoriesResult, recentCommentsResult, bannersResult] = await Promise.all([
    // 1) 메인 피드
    (async (): Promise<PostsResponse> => {
      try {
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
          supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", userIds),
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
    })(),

    // 2) 카테고리 (CommunitySidebar용)
    Promise.resolve(
      supabase
        .from("categories")
        .select("id, slug, name, icon, sort_order, description, parent_slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    )
      .then(({ data }) => data ?? [])
      .catch(() => [] as unknown[]),

    // 3) 최근 댓글 달린 글 (ActivitySidebar용)
    Promise.resolve(
      supabase
        .from("posts")
        .select("id, title, community_slug, comment_count, latest_comment_at, created_at")
        .is("deleted_at", null)
        .gt("comment_count", 0)
        .order("latest_comment_at", { ascending: false, nullsFirst: false })
        .limit(10)
    )
      .then(({ data }) => data ?? [])
      .catch(() => [] as unknown[]),

    // 4) 배너
    Promise.resolve(
      supabase
        .from("banners")
        .select("id, title, description, link_url, image_url, is_active, priority")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .limit(5)
    )
      .then(({ data }) => data ?? [])
      .catch(() => [] as unknown[]),
  ])

  return {
    initialFeed: feedResult,
    initialCategories: categoriesResult,
    initialRecentComments: recentCommentsResult,
    initialBanners: bannersResult,
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [params, homeData] = await Promise.all([searchParams, fetchAllHomeData()])

  return (
    <Suspense>
      <HomeClient
        initialFeed={homeData.initialFeed}
        initialCategories={homeData.initialCategories}
        initialRecentComments={homeData.initialRecentComments}
        initialBanners={homeData.initialBanners}
        isPredictionView={params.view === "prediction"}
      />
    </Suspense>
  )
}
