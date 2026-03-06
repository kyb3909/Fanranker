import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { settlePredictions } from "@/lib/betman/settle"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const resultItemSchema = z.object({
  game_no: z.number(),
  home_score: z.number().nullable(),
  away_score: z.number().nullable(),
  result: z.string(),
  status: z.string(),
})

const resultsPostSchema = z.object({
  gmTs: z.union([z.string(), z.number()]).transform(String),
  results: z.array(resultItemSchema).min(1, "results 배열이 비어 있습니다."),
})

/**
 * POST /api/betman/results
 *
 * 크롤링 스크립트(betman-fetch-results.ts)가 호출.
 * betman_games 테이블의 결과(home_score, away_score, result, status)를 업데이트.
 * 결과 반영 후 자동 정산 실행.
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
    const parsed = resultsPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { gmTs, results } = parsed.data

    const supabase = createServiceRoleClient()

    // gmTs로 round_id 조회
    const { data: round, error: roundError } = await supabase
      .from("betman_rounds")
      .select("id")
      .eq("gm_ts", String(gmTs))
      .single()

    if (roundError || !round) {
      return NextResponse.json(
        { error: `gmTs=${gmTs}에 해당하는 회차를 찾을 수 없습니다.` },
        { status: 404 }
      )
    }

    const roundId = round.id
    let updated = 0
    let cancelled = 0
    const errors: string[] = []

    // 각 경기 결과 업데이트
    for (const r of results) {
      const updateData: Record<string, unknown> = {
        status: r.status,
        updated_at: new Date().toISOString(),
      }

      if (r.home_score !== null) updateData.home_score = r.home_score
      if (r.away_score !== null) updateData.away_score = r.away_score

      if (r.result && r.result !== "") {
        updateData.result = r.result
      }

      const { error: updateError } = await supabase
        .from("betman_games")
        .update(updateData)
        .eq("round_id", roundId)
        .eq("game_no", r.game_no)

      if (updateError) {
        errors.push(`game_no=${r.game_no}: ${updateError.message}`)
      } else {
        if (r.status === "cancelled") {
          cancelled++
        } else {
          updated++
        }
      }
    }

    // --- 결과 반영된 게임의 자동 정산 ---
    const settleErrors: string[] = []
    let settleResult = null

    try {
      const updatedGameNos = results.map((r) => r.game_no)
      const { data: updatedGames } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
        )
        .eq("round_id", roundId)
        .in("game_no", updatedGameNos)
        .in("status", ["completed", "cancelled"])

      if (updatedGames && updatedGames.length > 0) {
        const gameIds = updatedGames.map((g) => g.id)

        const { data: predictions } = await supabase
          .from("betman_predictions")
          .select("id, user_id, game_id, prediction, status, slip_id, locked_odds, stake")
          .in("game_id", gameIds)
          .eq("status", "pending")

        if (predictions && predictions.length > 0) {
          // 공통 정산 로직 실행
          settleResult = await settlePredictions(supabase, updatedGames, predictions)
        }

        // daily round 상태 업데이트
        const dailyRoundIds = [
          ...new Set(updatedGames.map((g) => g.daily_round_id).filter(Boolean)),
        ]
        for (const drId of dailyRoundIds) {
          await supabase
            .from("betman_games")
            .update({ status: "in_progress", updated_at: new Date().toISOString() })
            .eq("daily_round_id", drId)
            .eq("status", "scheduled")
            .lt("match_time", new Date().toISOString())

          const { data: remaining } = await supabase
            .from("betman_games")
            .select("id")
            .eq("daily_round_id", drId)
            .in("status", ["scheduled", "in_progress"])
            .limit(1)

          const allDone = !remaining || remaining.length === 0
          if (allDone) {
            await supabase
              .from("betman_daily_rounds")
              .update({ status: "settled", updated_at: new Date().toISOString() })
              .eq("id", drId)
              .lt("bet_close_at", new Date().toISOString())
          }
        }
      }
    } catch (settleErr) {
      console.error("Auto-settle error (non-fatal):", settleErr)
      settleErrors.push(`auto-settle: ${(settleErr as Error).message}`)
    }

    return NextResponse.json({
      roundId,
      gmTs,
      updated,
      cancelled,
      total: results.length,
      autoSettle: settleResult
        ? {
            settled: settleResult.settled,
            correct: settleResult.correct,
            wrong: settleResult.wrong,
            cancelled: settleResult.cancelled,
          }
        : { settled: 0, correct: 0, wrong: 0, cancelled: 0 },
      errors:
        [...errors, ...settleErrors, ...(settleResult?.errors || [])].length > 0
          ? [...errors, ...settleErrors, ...(settleResult?.errors || [])]
          : undefined,
      message: `${updated}건 업데이트, ${cancelled}건 취소${settleResult ? `, ${settleResult.settled}건 자동 정산` : ""}`,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
