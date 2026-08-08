import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const InvestSchema = z.object({
  team_id: z.string().min(1),
  amount: z.number().int().min(1, "최소 1포인트 이상 투자해야 합니다."),
})

/**
 * POST /api/stadiums/invest
 *
 * 승부예측 수익(points_earned)을 사용하여 경기장 건설에 투자.
 *
 * 투자 가능 잔액 = 전체 적중 수익 합계 - 이미 투자한 총액
 *   = SUM(betman_predictions.points_earned) - SUM(stadium_investments.points_invested)
 *
 * 골드, 볼, 활동 포인트 사용 안 함.
 *
 * 2026-08-08 감사 P1-2: 잔액검사→insert→레벨→기여→fan_count 8단계가 트랜잭션 없이
 * 순차 실행되던 것을 RPC `invest_stadium_points` 하나로 원자화 (동시 요청 이중 투자
 * race 제거 — donate/정산 동기화와 같은 패턴으로 통일).
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청입니다.")
    }

    const parsed = InvestSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 입력입니다.")
    }

    const { team_id, amount } = parsed.data
    const supabase = createServiceRoleClient()

    // 팀 존재/활성 확인 (RPC 는 team_stadiums 만 보므로 비활성 핀은 여기서 거른다)
    const { data: team } = await supabase
      .from("team_map_pins")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("is_active", true)
      .single()
    if (!team) {
      return apiBadRequest("존재하지 않는 팀입니다.")
    }

    const { data, error } = await supabase.rpc("invest_stadium_points", {
      p_user_id: user.id,
      p_team_id: team_id,
      p_amount: amount,
    })
    if (error) {
      return apiError("투자 처리 중 오류가 발생했습니다.", 500, error)
    }

    const result = data as {
      success: boolean
      error?: string
      available?: number
      points_invested?: number
      new_total_points?: number
      new_level?: number
      leveled_up?: boolean
      available_after?: number
    }

    if (!result.success) {
      if (result.error === "insufficient") {
        return NextResponse.json(
          {
            error: "투자 가능한 포인트가 부족합니다.",
            available: result.available ?? 0,
            requested: amount,
          },
          { status: 400 }
        )
      }
      if (result.error === "team_not_found") {
        return apiBadRequest("존재하지 않는 팀입니다.")
      }
      return apiBadRequest("잘못된 입력입니다.")
    }

    return NextResponse.json({
      success: true,
      points_invested: result.points_invested,
      new_total_points: result.new_total_points,
      new_level: result.new_level,
      leveled_up: result.leveled_up,
      available_after: result.available_after,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
