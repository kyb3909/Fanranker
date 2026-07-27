import { createAnonClient } from "@/lib/supabase/server"
import { ExploreContent, type BoardStat } from "./explore-content"

// ISR 60초 — 어드민에서 채널 추가/토글 시 최대 1분 내 반영.
// 어드민 boards 라우트(POST/PATCH)가 revalidatePath('/explore') 호출하므로 보통 즉시 반영.
export const revalidate = 60

/** KST 오늘 00:00 의 UTC ISO — "오늘 글" 집계 경계 */
function kstTodayStartIso(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3_600_000)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth()
  const d = kst.getUTCDate()
  return new Date(Date.UTC(y, m, d) - 9 * 3_600_000).toISOString()
}

async function fetchExploreData() {
  const supabase = createAnonClient()

  const [categoriesResult, postsResult, allCatsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, icon, sort_order, description, parent_slug")
      .eq("is_active", true)
      .is("parent_slug", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("posts")
      .select("id, community_slug, title, vote_count, comment_count, view_count, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(0, 49),
    // 하위 채널까지 합산해야 게시판 카드의 글 수가 실제 규모와 맞는다
    supabase.from("categories").select("slug, parent_slug").eq("is_active", true),
  ])

  const topLevel = categoriesResult.data ?? []
  const childrenOf = new Map<string, string[]>()
  for (const c of allCatsResult.data ?? []) {
    if (!c.parent_slug) continue
    childrenOf.set(c.parent_slug, [...(childrenOf.get(c.parent_slug) ?? []), c.slug])
  }

  const todayIso = kstTodayStartIso()
  const stats: Record<string, BoardStat> = {}
  await Promise.all(
    topLevel.map(async (cat) => {
      const slugs = [cat.slug, ...(childrenOf.get(cat.slug) ?? [])]
      const [total, today] = await Promise.all([
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .in("community_slug", slugs),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .in("community_slug", slugs)
          .gte("created_at", todayIso),
      ])
      stats[cat.slug] = { total: total.count ?? 0, today: today.count ?? 0 }
    })
  )

  return {
    fallback: {
      "/api/categories": { categories: topLevel },
      "/api/posts?sort=new&limit=50": { posts: postsResult.data || [] },
    },
    stats,
  }
}

export default async function ExplorePage() {
  const { fallback, stats } = await fetchExploreData()

  return <ExploreContent fallback={fallback} stats={stats} />
}
