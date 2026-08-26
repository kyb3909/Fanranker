import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * GET /api/stadiums/[teamId]/my-bricks — 내 벽돌 투자 현황 (2026-08-27)
 *
 * 경기장 건설 지면의 "내 투자" 카드용:
 * - 내 벽돌 총합·쓴 점수
 * - 팀 내 순위 (벽돌 많이 산 순)
 * - 최근 구매 내역 (건별 — stadium_bricks 는 구매 1건 = 1행)
 *
 * 개인화 GET — CDN 에 얹히면 안 되므로 private, no-store 를 직접 세운다.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()
    const { teamId } = await params

    const supabase = createServiceRoleClient()

    const { data: mine } = await supabase
      .from("stadium_bricks")
      .select("brick_count, points_spent, start_index, created_at")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .order("id", { ascending: false })
      .limit(20)

    const myBricks = (mine ?? []).reduce((s, r) => s + r.brick_count, 0)
    const mySpent = (mine ?? []).reduce((s, r) => s + r.points_spent, 0)

    // 순위 — 벽돌 합 기준. 투자자 수가 팀당 수천을 넘기 전까지는 전량 집계로 충분하다.
    const { data: all } = await supabase
      .from("stadium_bricks")
      .select("user_id, brick_count")
      .eq("team_id", teamId)
    const sums = new Map<string, number>()
    for (const r of all ?? []) {
      sums.set(r.user_id, (sums.get(r.user_id) ?? 0) + r.brick_count)
    }
    let rank: number | null = null
    if (myBricks > 0) {
      rank = 1
      for (const [uid, n] of sums) {
        if (uid !== user.id && n > myBricks) rank++
      }
    }

    return NextResponse.json(
      {
        my_bricks: myBricks,
        my_points_spent: mySpent,
        rank,
        investor_count: sums.size,
        recent: (mine ?? []).map((r) => ({
          bricks: r.brick_count,
          points: r.points_spent,
          start_index: r.start_index,
          at: r.created_at,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
