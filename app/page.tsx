import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createAnonClient } from "@/lib/supabase/server"
import { HomeClient } from "@/components/home/home-client"
import type { PostsResponse, SortType } from "@/hooks/use-feed"

// 홈페이지 ISR: 5분 캐시 + stale-while-revalidate.
// 새 글 작성 시 /api/posts POST가 revalidatePath("/")로 즉시 갱신.
export const revalidate = 300

/**
 * 홈 페이지 (Server Component)
 *
 * 서버에서 피드 + 사이드바 + 배너 데이터를 병렬로 프리페치하여
 * 클라이언트 API 워터폴을 제거. TTFB에 모든 데이터가 포함됨.
 */
async function fetchAllHomeData(sort: SortType) {
  const supabase = createAnonClient()

  // 모든 데이터를 병렬로 가져오기
  const [feedResult, categoriesResult, recentCommentsResult] = await Promise.all([
    // 1) 메인 피드 — 정렬 반영(최신순=created_at, 그 외=temperature)으로 깜빡임 제거
    (async (): Promise<PostsResponse> => {
      try {
        // active 게시판만 — 게시판 축소(is_active)를 비로그인 담벼락에도 일관 적용.
        // 이 initialFeed 는 use-feed 가 hot+비로그인일 때 그대로 fallback 으로 쓰므로
        // 여기서 안 막으면 숨긴 게시판 글이 담벼락에 그대로 노출된다.
        const { data: activeCats } = await supabase
          .from("categories")
          .select("slug")
          .eq("is_active", true)
        const activeSlugs = (activeCats ?? []).map((c) => c.slug)
        const base = supabase
          .from("posts")
          .select(
            "id, user_id, community_slug, title, content, image, vote_count, comment_count, temperature, created_at"
          )
          .is("deleted_at", null)
          .in("community_slug", activeSlugs)
        const ordered =
          sort === "new"
            ? base.order("created_at", { ascending: false })
            : base.order("temperature", { ascending: false, nullsFirst: false })
        const { data: posts, error } = await ordered.range(0, 19)

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
  ])

  return {
    initialFeed: feedResult,
    initialCategories: categoriesResult,
    initialRecentComments: recentCommentsResult,
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams

  // 옛 ?view=prediction 링크는 /prediction 1급 라우트로 영구 이동.
  if (params.view === "prediction") {
    redirect(params.tab ? `/prediction?tab=${params.tab}` : "/prediction")
  }

  const initialSort: SortType =
    params.sort === "new" ? "new" : params.sort === "random" ? "random" : "hot"
  const homeData = await fetchAllHomeData(initialSort)

  return (
    <Suspense>
      <HomeClient
        initialFeed={homeData.initialFeed}
        initialCategories={homeData.initialCategories}
        initialRecentComments={homeData.initialRecentComments}
        initialTab={params.tab === "content" ? "content" : "feed"}
        initialSort={initialSort}
      />
    </Suspense>
  )
}
