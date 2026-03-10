import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"

type PendingGameRow = {
  round_id: string | null
  match_time: string | null
  result: string | null
  home_score: number | null
  away_score: number | null
}

function hasMissingResult(game: Pick<PendingGameRow, "result">) {
  return game.result === null || game.result === ""
}

function hasMissingScore(game: Pick<PendingGameRow, "result" | "home_score" | "away_score">) {
  return !hasMissingResult(game) && (game.home_score === null || game.away_score === null)
}

/**
 * GET /api/betman/pending-results
 *
 * 결과 또는 스코어가 비어있는 과거 경기의 gmTs 목록을 반환한다.
 * VPS 스크립트에서 재수집(backfill) 대상으로 사용.
 */
export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 20)))
    const days = Math.max(1, Math.min(365, Number(searchParams.get("days") || 30)))

    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - days)

    const supabase = createServiceRoleClient()

    const fetchLimit = Math.max(limit * 50, 200)
    const { data: candidateGames, error: missingError } = await supabase
      .from("betman_games")
      .select("round_id, match_time, result, home_score, away_score")
      .not("round_id", "is", null)
      .lt("match_time", now.toISOString())
      .gte("match_time", from.toISOString())
      .in("status", ["scheduled", "in_progress", "completed"])
      .or("result.is.null,result.eq.,home_score.is.null,away_score.is.null")
      .order("match_time", { ascending: false })
      .limit(fetchLimit)

    if (missingError) {
      return apiError("누락 경기 조회 실패", 500, missingError)
    }

    const missingGames = ((candidateGames || []) as PendingGameRow[]).filter(
      (game) => hasMissingResult(game) || hasMissingScore(game)
    )

    if (missingGames.length === 0) {
      return NextResponse.json({
        items: [],
        totalRounds: 0,
        totalMissingGames: 0,
        totalMissingResultGames: 0,
        totalMissingScoreGames: 0,
        days,
      })
    }

    const missingByRoundId = new Map<string, { total: number; result: number; score: number }>()
    for (const g of missingGames) {
      if (!g.round_id) continue
      const current = missingByRoundId.get(g.round_id) || { total: 0, result: 0, score: 0 }
      current.total += 1
      if (hasMissingResult(g)) current.result += 1
      if (hasMissingScore(g)) current.score += 1
      missingByRoundId.set(g.round_id, current)
    }

    const roundIds = Array.from(missingByRoundId.keys())
    if (roundIds.length === 0) {
      return NextResponse.json({
        items: [],
        totalRounds: 0,
        totalMissingGames: 0,
        days,
      })
    }

    const { data: rounds, error: roundsError } = await supabase
      .from("betman_rounds")
      .select("id, gm_ts")
      .in("id", roundIds)

    if (roundsError) {
      return apiError("라운드 조회 실패", 500, roundsError)
    }

    const items = (rounds || [])
      .filter((r) => !!r.gm_ts)
      .map((r) => ({
        roundId: r.id,
        gmTs: String(r.gm_ts),
        missingGames: missingByRoundId.get(r.id)?.total || 0,
        missingResultGames: missingByRoundId.get(r.id)?.result || 0,
        missingScoreGames: missingByRoundId.get(r.id)?.score || 0,
      }))
      .sort((a, b) => {
        if (b.missingGames !== a.missingGames) return b.missingGames - a.missingGames
        return Number(b.gmTs) - Number(a.gmTs)
      })
      .slice(0, limit)

    return NextResponse.json({
      items,
      totalRounds: items.length,
      totalMissingGames: missingGames.length,
      totalMissingResultGames: missingGames.filter(hasMissingResult).length,
      totalMissingScoreGames: missingGames.filter(hasMissingScore).length,
      days,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
