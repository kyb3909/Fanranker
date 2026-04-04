import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"

/**
 * GET /api/stadiums/my-earnings
 *
 * 내 승부예측 수익 잔�� (투자 가능 포인트)
 *
 * 잔액 = SUM(betman_predictions.points_earned) - SUM(stadium_investments.points_invested)
 */
export async function GET(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()

    // 전체 적중 수익
    const { data: earningsRows } = await supabase
      .from("betman_predictions")
      .select("points_earned")
      .eq("user_id", user.id)
      .eq("status", "settled")
      .eq("is_correct", true)

    const totalEarned = Math.floor(
      (earningsRows ?? []).reduce((sum, r) => sum + (r.points_earned ?? 0), 0)
    )

    // 이미 투자한 총액
    const { data: investedRows } = await supabase
      .from("stadium_investments")
      .select("points_invested")
      .eq("user_id", user.id)

    const totalInvested = (investedRows ?? []).reduce((sum, r) => sum + (r.points_invested ?? 0), 0)

    return NextResponse.json({
      total_earned: totalEarned,
      total_invested: totalInvested,
      available: Math.max(0, totalEarned - totalInvested),
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
