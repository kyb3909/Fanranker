import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { batchUpdateUserStats } from "@/lib/betman/stats"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"

/**
 * POST /api/betman/stats/recalculate
 *
 * 전체 유저의 betman_user_sport_stats를 처음부터 재계산한다.
 * 데이터 정합성 보정용 (관리자 전용).
 *
 * 최적화:
 *   - 유저 10명씩 병렬 처리 (DB 커넥션 부하 제한)
 *   - 유저당 DB 호출: SELECT 2회 (병렬) + UPSERT 1회 (배치)
 *   - 1000명 기준 ~300 DB 호출 (기존 ~7000 → 95% 감소)
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    // 정산된 예측이 있는 모든 유저 조회
    const { data: userRows, error: userError } = await supabase
      .from("betman_predictions")
      .select("user_id")
      .in("status", ["settled", "cancelled"])

    if (userError) {
      return NextResponse.json({ error: "유저 조회 실패" }, { status: 500 })
    }

    const userIds = [...new Set((userRows || []).map((r) => r.user_id))]

    if (userIds.length === 0) {
      return NextResponse.json({
        message: "재계산할 유저가 없습니다.",
        updated: 0,
      })
    }

    // 병렬 배치 처리 (10명씩)
    const startTime = Date.now()
    const { updated, errors } = await batchUpdateUserStats(supabase, userIds, 10)
    const elapsed = Date.now() - startTime

    return NextResponse.json({
      message: `${updated}명의 통계를 재계산했습니다. (${elapsed}ms)`,
      updated,
      totalUsers: userIds.length,
      elapsedMs: elapsed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
