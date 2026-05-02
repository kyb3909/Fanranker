import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/profile/me/titles
 *
 * 본인의 팬 정체성 데이터 한 번에 조회:
 * - flair 점수 top N (community_slug + flair name + score_total + score_balance)
 * - 잠금 해제된 호칭 (flair name + title name + threshold + unlocked_at)
 * - 잠금 안 됐지만 곧 도달하는 호칭 (다음 임계값 + 진행률)
 * - 현재 표시 중인 호칭 id
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()
    const supabase = createServiceRoleClient()

    // 1. 본인 flair 점수 top 10
    const { data: scoresRaw } = await supabase
      .from("user_flair_scores")
      .select("flair_id, score_total, score_balance, last_at")
      .eq("user_id", user.id)
      .order("score_total", { ascending: false })
      .limit(10)

    const scores = scoresRaw || []
    const flairIds = scores.map((s) => s.flair_id)

    // 2. flair 메타 (name, color, community_slug, team_id)
    const { data: flairs } =
      flairIds.length > 0
        ? await supabase
            .from("post_flairs")
            .select("id, name, color, community_slug, team_id")
            .in("id", flairIds)
        : { data: [] }
    const flairMap = new Map((flairs || []).map((f) => [f.id, f]))

    // 3. 잠금 해제된 호칭
    const { data: unlocked } = await supabase
      .from("user_unlocked_titles")
      .select("title_id, unlocked_at")
      .eq("user_id", user.id)
    const unlockedIds = new Set((unlocked || []).map((u) => u.title_id))
    const unlockedMap = new Map((unlocked || []).map((u) => [u.title_id, u.unlocked_at]))

    // 4. 본인 점수가 있는 flair 의 호칭 풀 전체 조회
    const { data: titles } =
      flairIds.length > 0
        ? await supabase
            .from("flair_titles")
            .select("id, flair_id, name, threshold, sort_order")
            .in("flair_id", flairIds)
            .order("threshold", { ascending: true })
        : { data: [] }

    // 5. 사용자 표시 호칭
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_title_id")
      .eq("user_id", user.id)
      .maybeSingle()
    const displayTitleId = profile?.display_title_id ?? null

    // 6. 페이로드 조립
    const flairScores = scores.map((s) => {
      const f = flairMap.get(s.flair_id)
      return {
        flair_id: s.flair_id,
        flair_name: f?.name ?? "",
        flair_color: f?.color ?? null,
        community_slug: f?.community_slug ?? "",
        team_id: f?.team_id ?? null,
        score_total: s.score_total,
        score_balance: s.score_balance,
      }
    })

    const allTitles = (titles || []).map((t) => ({
      id: t.id,
      flair_id: t.flair_id,
      flair_name: flairMap.get(t.flair_id)?.name ?? "",
      name: t.name,
      threshold: t.threshold,
      unlocked: unlockedIds.has(t.id),
      unlocked_at: unlockedMap.get(t.id) ?? null,
      is_current_display: t.id === displayTitleId,
    }))

    return NextResponse.json({
      display_title_id: displayTitleId,
      flair_scores: flairScores,
      titles: allTitles,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
