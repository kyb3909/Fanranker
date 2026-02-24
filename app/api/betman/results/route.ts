import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { updateUserSportStats } from "@/lib/betman/stats"
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
 *
 * Body: {
 *   gmTs: string,
 *   results: Array<{
 *     game_no: number,
 *     home_score: number | null,
 *     away_score: number | null,
 *     result: string,   // 'home' | 'draw' | 'away' | 'over' | 'under' | 'cancelled' | ''
 *     status: string,   // 'completed' | 'cancelled'
 *   }>
 * }
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

      // home_score, away_score 설정 (null이 아닌 경우만)
      if (r.home_score !== null) updateData.home_score = r.home_score
      if (r.away_score !== null) updateData.away_score = r.away_score

      // result 설정 (빈 문자열이면 null 유지 — SUM 게임)
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

    // --- 결과 반영된 게임의 daily round 자동 정산 ---
    let autoSettled = 0
    let autoSettleCorrect = 0
    let autoSettleWrong = 0
    let autoSettleCancelled = 0
    const settleErrors: string[] = []

    try {
      // 결과가 반영된 게임들의 daily_round_id 수집
      const updatedGameNos = results.map((r) => r.game_no)
      const { data: updatedGames } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, daily_round_id"
        )
        .eq("round_id", roundId)
        .in("game_no", updatedGameNos)
        .in("status", ["completed", "cancelled"])

      if (updatedGames && updatedGames.length > 0) {
        const gameMap = new Map(updatedGames.map((g) => [g.id, g]))
        const gameIds = updatedGames.map((g) => g.id)

        // 해당 게임들의 pending 예측 조회
        const { data: predictions } = await supabase
          .from("betman_predictions")
          .select("id, user_id, game_id, prediction, status")
          .in("game_id", gameIds)
          .eq("status", "pending")

        if (predictions && predictions.length > 0) {
          for (const pred of predictions) {
            const game = gameMap.get(pred.game_id)
            if (!game) continue

            if (game.status === "cancelled") {
              const { error } = await supabase
                .from("betman_predictions")
                .update({
                  status: "cancelled",
                  is_correct: null,
                  points_earned: 0,
                  settled_at: new Date().toISOString(),
                })
                .eq("id", pred.id)
              if (!error) autoSettleCancelled++
              else settleErrors.push(`pred=${pred.id}: ${error.message}`)
              continue
            }

            const isCorrect = pred.prediction === game.result
            let pointsEarned = 0
            if (isCorrect) {
              const oddsMap: Record<string, number> = {
                home: parseFloat(game.home_win_odds) || 0,
                away: parseFloat(game.away_win_odds) || 0,
                draw: parseFloat(game.draw_odds) || 0,
                over: parseFloat(game.over_odds) || 0,
                under: parseFloat(game.under_odds) || 0,
              }
              pointsEarned = oddsMap[pred.prediction] || 0
            }

            const { error } = await supabase
              .from("betman_predictions")
              .update({
                status: "settled",
                is_correct: isCorrect,
                points_earned: pointsEarned,
                settled_at: new Date().toISOString(),
              })
              .eq("id", pred.id)

            if (!error) {
              autoSettled++
              if (isCorrect) autoSettleCorrect++
              else autoSettleWrong++
            } else {
              settleErrors.push(`pred=${pred.id}: ${error.message}`)
            }
          }

          // 유저별 종목 통계 갱신
          const affectedUserIds = [...new Set(predictions.map((p) => p.user_id))]
          for (const userId of affectedUserIds) {
            try {
              await updateUserSportStats(supabase, userId)
            } catch (e) {
              settleErrors.push(`stats user=${userId}: ${(e as Error).message}`)
            }
          }
        }

        // daily round 상태 업데이트
        const dailyRoundIds = [
          ...new Set(updatedGames.map((g) => g.daily_round_id).filter(Boolean)),
        ]
        for (const drId of dailyRoundIds) {
          // 지난 scheduled 게임 자동 만료 처리
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
            // bet_close_at이 지난 라운드만 settled로 전환 (베팅 보호)
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
      autoSettle: {
        settled: autoSettled,
        correct: autoSettleCorrect,
        wrong: autoSettleWrong,
        cancelled: autoSettleCancelled,
      },
      errors: [...errors, ...settleErrors].length > 0 ? [...errors, ...settleErrors] : undefined,
      message: `${updated}건 업데이트, ${cancelled}건 취소, ${autoSettled}건 자동 정산`,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
