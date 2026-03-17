import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const scoreItemSchema = z.object({
  game_round: z.string(),
  game_no: z.number(),
  home_score: z.number(),
  away_score: z.number(),
})

const scoresPostSchema = z.object({
  scores: z.array(scoreItemSchema).min(1, "scores 배열이 비어 있습니다."),
})

/**
 * POST /api/betman/scores
 *
 * VPS wisetoto 크롤러가 실시간 경기 점수를 전송.
 * game_round(=betman gm_ts) + game_no로 betman_games 매칭 후 점수 업데이트.
 * 점수가 존재하면 status를 'in_progress'로 변경.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }

    const parsed = scoresPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }

    const { scores } = parsed.data
    const supabase = createServiceRoleClient()

    // game_round(gm_ts)별로 그룹핑하여 round_id 일괄 조회
    const gmTsList = [...new Set(scores.map((s) => s.game_round))]
    const { data: rounds } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .in("gm_ts", gmTsList)

    const roundMap = new Map((rounds || []).map((r) => [r.gm_ts, r.id]))

    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const s of scores) {
      const roundId = roundMap.get(s.game_round)
      if (!roundId) {
        errors.push(`gm_ts=${s.game_round}: 라운드 없음`)
        skipped++
        continue
      }

      const { data: rows, error: updateError } = await supabase
        .from("betman_games")
        .update({
          home_score: s.home_score,
          away_score: s.away_score,
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("round_id", roundId)
        .eq("game_no", s.game_no)
        .in("status", ["scheduled", "in_progress"])
        .select("id")

      if (updateError) {
        errors.push(`game_no=${s.game_no} (gm_ts=${s.game_round}): ${updateError.message}`)
      } else if (!rows || rows.length === 0) {
        skipped++ // 이미 completed/cancelled 상태
      } else {
        updated++
      }
    }

    return NextResponse.json({
      updated,
      skipped,
      total: scores.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updated}건 점수 업데이트 완료`,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
