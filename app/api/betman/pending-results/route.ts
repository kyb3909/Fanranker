import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/betman/pending-results
 *
 * 결과가 비어있는 과거 경기의 gmTs 목록을 반환한다.
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
    const { data: missingGames, error: missingError } = await supabase
      .from("betman_games")
      .select("round_id, match_time")
      .not("round_id", "is", null)
      .lt("match_time", now.toISOString())
      .gte("match_time", from.toISOString())
      .in("status", ["scheduled", "in_progress", "completed"])
      .or("result.is.null,result.eq.")
      .order("match_time", { ascending: false })
      .limit(fetchLimit)

    if (missingError) {
      return apiError("누락 경기 조회 실패", 500, missingError)
    }

    if (!missingGames || missingGames.length === 0) {
      return NextResponse.json({
        items: [],
        totalRounds: 0,
        totalMissingGames: 0,
        days,
      })
    }

    const missingByRoundId = new Map<string, number>()
    for (const g of missingGames) {
      if (!g.round_id) continue
      missingByRoundId.set(g.round_id, (missingByRoundId.get(g.round_id) || 0) + 1)
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
        missingGames: missingByRoundId.get(r.id) || 0,
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
      days,
    })
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}
