import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"
import { shouldBlockResultChange, describeBlockReason } from "@/lib/betman/result-guard"
import { z } from "zod"

export const dynamic = "force-dynamic"

const resultSchema = z.object({
  game_id: z.string().uuid(),
  home_score: z.number().int().min(0).max(999),
  away_score: z.number().int().min(0).max(999),
  result: z.enum(["home", "away", "draw", "over", "under", "odd", "even", "cancelled"]),
  status: z.enum(["scheduled", "in_progress", "finished", "completed", "cancelled"]).optional(),
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

    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

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

    // 정산 후 결과 덮어쓰기 가드 (R1 / 단계 0-1, 2026-08-06):
    // settled 픽이 있는 경기의 결과·취소 전환을 차단한다 — lib/betman/result-guard.ts 참조.
    const gameIds = Array.from(new Set(results.map((r) => r.game_id)))

    const { data: currentGames, error: gamesError } = await supabase
      .from("betman_games")
      .select("id, result, status")
      .in("id", gameIds)

    if (gamesError) {
      return apiError("경기 조회 실패", 500, gamesError)
    }

    const gameById = new Map((currentGames || []).map((g) => [g.id, g]))

    const { data: settledPicks, error: settledError } = await supabase
      .from("betman_predictions")
      .select("game_id")
      .in("game_id", gameIds)
      .eq("status", "settled")

    if (settledError) {
      return apiError("정산 픽 조회 실패", 500, settledError)
    }

    const settledGameIds = new Set((settledPicks || []).map((p) => p.game_id))

    let updated = 0
    let cancelled = 0
    let blocked = 0
    const errors: string[] = []

    for (const r of results) {
      const current = gameById.get(r.game_id)
      if (!current) {
        errors.push(`game=${r.game_id}: 존재하지 않는 경기입니다`)
        continue
      }

      const status = r.result === "cancelled" ? "cancelled" : (r.status ?? "completed")
      const incomingResult = r.result === "cancelled" ? null : r.result

      const verdict = shouldBlockResultChange({
        hasSettledPicks: settledGameIds.has(r.game_id),
        currentResult: current.result,
        currentStatus: current.status,
        incomingResult,
        incomingStatus: status,
      })

      if (verdict.blocked && verdict.reason) {
        blocked++
        errors.push(
          `game=${r.game_id}: ${describeBlockReason(verdict.reason)}은(는) 차단됩니다 ` +
            `(현재 result=${current.result ?? "없음"}, status=${current.status}). ` +
            `정정 정책(D-5) 확정 전까지 전면 금지 — 필요 시 오너 결정 후 재개.`
        )
        continue
      }

      const updateData: Record<string, unknown> = {
        home_score: r.home_score,
        away_score: r.away_score,
        result: incomingResult,
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
        errors.push(`game=${r.game_id}: 존재하지 않는 경기입니다`)
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
      blocked: blocked > 0 ? blocked : undefined,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updated}건 결과 저장${cancelled > 0 ? `, ${cancelled}건 취소 처리` : ""}${
        blocked > 0 ? `, ${blocked}건 차단(정산 완료)` : ""
      }`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
