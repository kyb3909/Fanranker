import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isAdmin } from "@/lib/supabase/admin"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

export const dynamic = "force-dynamic"

const resultSchema = z.object({
  game_id: z.string().uuid(),
  home_score: z.number().int().min(0).max(999),
  away_score: z.number().int().min(0).max(999),
  result: z.enum(["home", "away", "draw", "over", "under", "odd", "even", "cancelled"]),
})

const batchResultSchema = z.object({
  results: z.array(resultSchema).min(1).max(50),
})

/**
 * POST /api/admin/matches/result
 *
 * 관리자 수동 경기 결과 입력/수정
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const admin = await isAdmin()
    if (!admin) {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const supabase = createServiceRoleClient()

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }

    const parsed = batchResultSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청 형식입니다.")
    }

    const { results } = parsed.data
    let updated = 0
    let cancelled = 0
    const errors: string[] = []

    for (const r of results) {
      const status = r.result === "cancelled" ? "cancelled" : "completed"

      const updateData: Record<string, unknown> = {
        home_score: r.home_score,
        away_score: r.away_score,
        result: r.result === "cancelled" ? null : r.result,
        status,
        updated_at: new Date().toISOString(),
      }

      const { data: updatedRows, error } = await supabase
        .from("betman_games")
        .update(updateData)
        .eq("id", r.game_id)
        .select("id")

      if (error) {
        errors.push(`game=${r.game_id}: ${error.message}`)
      } else if (!updatedRows || updatedRows.length === 0) {
        errors.push(
          `game=${r.game_id}: 업데이트할 수 없습니다 (이미 정산 완료되었거나 존재하지 않음)`
        )
      } else {
        if (status === "cancelled") cancelled++
        else updated++
      }
    }

    if (updated + cancelled === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0],
          errors,
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      updated,
      cancelled,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updated}건 결과 저장${cancelled > 0 ? `, ${cancelled}건 취소 처리` : ""}`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
