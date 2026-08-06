import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { settlePredictions } from "@/lib/betman/settle"
import { deriveResultFromScore } from "@/lib/betman/result-mapper"
import { shouldBlockResultChange, describeBlockReason } from "@/lib/betman/result-guard"
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
 * VPS 스크립트가 호출하여 경기 결과를 반영하고 자동 정산을 수행한다.
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

    const { data: round, error: roundError } = await supabase
      .from("betman_rounds")
      .select("id")
      .eq("gm_ts", String(gmTs))
      .single()

    if (roundError || !round) {
      return NextResponse.json(
        { error: `gmTs=${gmTs}에 해당하는 라운드를 찾을 수 없습니다.` },
        { status: 404 }
      )
    }

    const roundId = round.id
    const targetGameNos = Array.from(new Set(results.map((r) => r.game_no)))

    const { data: targetGames, error: targetGamesError } = await supabase
      .from("betman_games")
      .select("id, game_no, game_type, handicap, over_under_line, result, status")
      .eq("round_id", roundId)
      .in("game_no", targetGameNos)

    if (targetGamesError) {
      return apiError("정산 대상 경기 조회 실패", 500, targetGamesError)
    }

    const gameByNo = new Map((targetGames || []).map((g) => [g.game_no, g]))

    // 정산 후 결과 덮어쓰기 가드 (R1 / 단계 0-1, 2026-08-06):
    // VPS 재수신·백필이 이미 정산된 경기의 result 를 바꾸면 지급 기록과 어긋난다.
    // settled 픽이 있는 경기의 결과 변경분은 건너뛰고 나머지는 정상 처리 — lib/betman/result-guard.ts.
    const targetGameIds = (targetGames || []).map((g) => g.id)
    const settledGameIds = new Set<string>()
    if (targetGameIds.length > 0) {
      const { data: settledPicks, error: settledError } = await supabase
        .from("betman_predictions")
        .select("game_id")
        .in("game_id", targetGameIds)
        .eq("status", "settled")
      if (settledError) {
        return apiError("정산 픽 조회 실패", 500, settledError)
      }
      for (const p of settledPicks || []) settledGameIds.add(p.game_id)
    }

    let updated = 0
    let cancelled = 0
    let derived = 0
    let unresolved = 0
    let blocked = 0
    const errors: string[] = []

    for (const r of results) {
      const gameMeta = gameByNo.get(r.game_no)
      if (!gameMeta) {
        errors.push(`game_no=${r.game_no}: 해당 경기 없음 (round=${roundId})`)
        continue
      }

      let finalResult = r.result
      if (
        (!finalResult || finalResult === "") &&
        r.status === "completed" &&
        r.home_score !== null &&
        r.away_score !== null
      ) {
        finalResult = deriveResultFromScore(
          r.home_score,
          r.away_score,
          gameMeta.game_type,
          gameMeta.handicap,
          gameMeta.over_under_line
        )
        if (finalResult) derived++
      }

      if ((!finalResult || finalResult === "") && r.status === "completed") {
        unresolved++
        errors.push(`game_no=${r.game_no}: 완료 상태이지만 결과를 확정하지 못함`)
      }

      const verdict = shouldBlockResultChange({
        hasSettledPicks: settledGameIds.has(gameMeta.id),
        currentResult: gameMeta.result,
        currentStatus: gameMeta.status,
        incomingResult: finalResult && finalResult !== "" ? finalResult : null,
        incomingStatus: r.status,
      })

      if (verdict.blocked && verdict.reason) {
        blocked++
        errors.push(
          `game_no=${r.game_no}: ${describeBlockReason(verdict.reason)} 차단 ` +
            `(현재 result=${gameMeta.result ?? "없음"}, 수신 result=${finalResult || "없음"})`
        )
        continue
      }

      const updateData: Record<string, unknown> = {
        status: r.status,
        updated_at: new Date().toISOString(),
      }

      if (r.home_score !== null) updateData.home_score = r.home_score
      if (r.away_score !== null) updateData.away_score = r.away_score
      if (finalResult && finalResult !== "") updateData.result = finalResult

      const { data: updatedRows, error: updateError } = await supabase
        .from("betman_games")
        .update(updateData)
        .eq("round_id", roundId)
        .eq("game_no", r.game_no)
        .select("id")

      if (updateError) {
        errors.push(`game_no=${r.game_no}: ${updateError.message}`)
      } else if (!updatedRows || updatedRows.length === 0) {
        errors.push(`game_no=${r.game_no}: 해당 경기를 찾을 수 없음 (round=${roundId})`)
      } else {
        if (r.status === "cancelled") cancelled++
        else updated++
      }
    }

    const settleErrors: string[] = []
    let settleResult = null

    try {
      const { data: updatedGames } = await supabase
        .from("betman_games")
        .select(
          "id, game_no, game_type, sport, result, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
        )
        .eq("round_id", roundId)
        .in("game_no", targetGameNos)
        .in("status", ["completed", "cancelled"])

      const settleableGames = (updatedGames || []).filter(
        (g) => g.status === "cancelled" || (!!g.result && g.result !== "")
      )

      if (settleableGames.length > 0) {
        const gameIds = settleableGames.map((g) => g.id)

        const { data: predictions } = await supabase
          .from("betman_predictions")
          .select("id, user_id, game_id, prediction, status, slip_id, locked_odds, stake")
          .in("game_id", gameIds)
          .eq("status", "pending")

        if (predictions && predictions.length > 0) {
          settleResult = await settlePredictions(supabase, settleableGames, predictions)
        }

        const dailyRoundIds = [
          ...new Set(settleableGames.map((g) => g.daily_round_id).filter(Boolean)),
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
      console.error("Auto-settle error:", settleErr)
      settleErrors.push(`auto-settle: ${(settleErr as Error).message}`)
      const Sentry = await import("@sentry/nextjs")
      Sentry.captureException(settleErr, {
        extra: { roundId, gmTs, updatedGameCount: results.length },
      })
    }

    return NextResponse.json({
      roundId,
      gmTs,
      updated,
      cancelled,
      derived,
      unresolved,
      blocked,
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
      message: `${updated}건 업데이트, ${cancelled}건 취소${derived > 0 ? `, ${derived}건 결과 유추` : ""}${
        blocked > 0 ? `, ${blocked}건 가드 차단(정산 완료)` : ""
      }${settleResult ? `, ${settleResult.settled}건 자동 정산` : ""}`,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
