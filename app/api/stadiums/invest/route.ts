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
 * 승��예측 수익(points_earned)을 사용하여 경기장 건설에 투자.
 *
 * 투자 가능 잔액 = 전체 적중 수익 합계 - 이미 투자한 총액
 *   = SUM(betman_predictions.points_earned) - SUM(stadium_investments.points_invested)
 *
 * 골드, 볼, 활동 포인트 사용 안 함.
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

    // 1. 팀 존재 확인
    const { data: team } = await supabase
      .from("team_map_pins")
      .select("team_id, team_name")
      .eq("team_id", team_id)
      .eq("is_active", true)
      .single()

    if (!team) {
      return apiBadRequest("존재하지 않는 팀입니다.")
    }

    // 2. 전체 적중 수익 합계 (points_earned)
    const { data: earningsRows } = await supabase
      .from("betman_predictions")
      .select("points_earned")
      .eq("user_id", user.id)
      .eq("status", "settled")
      .eq("is_correct", true)

    const totalEarned = Math.floor(
      (earningsRows ?? []).reduce((sum, r) => sum + (r.points_earned ?? 0), 0)
    )

    // 3. 이미 투자한 총액
    const { data: investedRows } = await supabase
      .from("stadium_investments")
      .select("points_invested")
      .eq("user_id", user.id)

    const totalInvested = (investedRows ?? []).reduce((sum, r) => sum + (r.points_invested ?? 0), 0)

    // 4. 투자 가능 잔액
    const available = Math.max(0, totalEarned - totalInvested)

    if (amount > available) {
      return NextResponse.json(
        {
          error: "투자 가능한 포인트가 부족합니다.",
          available,
          requested: amount,
        },
        { status: 400 }
      )
    }

    // 5. 투자 기록
    const { error: investErr } = await supabase.from("stadium_investments").insert({
      user_id: user.id,
      team_id,
      points_invested: amount,
    })

    if (investErr) {
      return apiError("투자 기록 중 오류가 발생했습니다.", 500, investErr)
    }

    // 6. team_stadiums.total_points 증가 + 레벨 재계산
    const { data: stadiumBefore } = await supabase
      .from("team_stadiums")
      .select("level, total_points")
      .eq("team_id", team_id)
      .single()

    const prevLevel = stadiumBefore?.level ?? 1
    const newTotalPoints = (stadiumBefore?.total_points ?? 0) + amount

    await supabase
      .from("team_stadiums")
      .update({
        total_points: newTotalPoints,
        updated_at: new Date().toISOString(),
      })
      .eq("team_id", team_id)

    // 레벨 재계산
    const { data: levelThresholds } = await supabase
      .from("stadium_level_thresholds")
      .select("level, required_points")
      .lte("required_points", newTotalPoints)
      .order("level", { ascending: false })
      .limit(1)

    const newLevel = levelThresholds?.[0]?.level ?? 1

    if (newLevel > prevLevel) {
      await supabase.from("team_stadiums").update({ level: newLevel }).eq("team_id", team_id)
    }

    // 7. 기여자 기록 누적
    const { data: existingContrib } = await supabase
      .from("stadium_contributions")
      .select("points_contributed")
      .eq("user_id", user.id)
      .eq("team_id", team_id)
      .single()

    if (existingContrib) {
      await supabase
        .from("stadium_contributions")
        .update({
          points_contributed: existingContrib.points_contributed + amount,
          last_synced_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("team_id", team_id)
    } else {
      await supabase.from("stadium_contributions").insert({
        user_id: user.id,
        team_id,
        points_contributed: amount,
        last_synced_at: new Date().toISOString(),
      })
    }

    // 8. fan_count 갱신
    const { data: fanCountRow } = await supabase
      .from("stadium_contributions")
      .select("user_id")
      .eq("team_id", team_id)
      .gt("points_contributed", 0)

    await supabase
      .from("team_stadiums")
      .update({ fan_count: fanCountRow?.length ?? 0 })
      .eq("team_id", team_id)

    return NextResponse.json({
      success: true,
      points_invested: amount,
      new_total_points: newTotalPoints,
      new_level: newLevel,
      leveled_up: newLevel > prevLevel,
      available_after: available - amount,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
