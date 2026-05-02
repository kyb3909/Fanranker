import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const Body = z.object({
  flair_id: z.string().uuid(),
  amount: z.number().int().min(1, "최소 1점 이상 기부해야 합니다."),
})

/**
 * POST /api/flair/donate
 * { flair_id, amount }
 *
 * flair 활동 점수 잔액(balance)을 그 flair 의 team_id 경기장에 기부.
 * - balance 차감 (total 은 영향 없음 — 호칭 유지)
 * - team_stadiums.total_points 증가 + 레벨 재계산
 * - stadium_contributions 에 누적
 * - fan_count 갱신
 *
 * flair 의 team_id 가 NULL (리그 flair) 이면 실패.
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
    const parsed = Body.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 입력입니다.")
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc("donate_flair_score_to_team", {
      p_user_id: user.id,
      p_flair_id: parsed.data.flair_id,
      p_amount: parsed.data.amount,
    })

    if (error) {
      return apiError("기부 처리 중 오류가 발생했습니다.", 500, error)
    }

    const result = data as {
      ok: boolean
      error?: string
      team_id?: string
      amount_donated?: number
      new_balance?: number
      stadium_total_points?: number
      stadium_level?: number
      leveled_up?: boolean
      fan_count?: number
    } | null

    if (!result?.ok) {
      return NextResponse.json({ error: result?.error || "기부 실패" }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
