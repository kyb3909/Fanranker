import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, checkRateLimit } from "@/lib/api-error"

const GAMES = new Set(["corner-hero", "pass-survivor", "rondo"])

/**
 * GET /api/minigames/leaderboard?game=rondo
 *
 * 오늘(KST) 해당 게임의 유저별 최고점 TOP 10. 비로그인도 조회 가능 (공개 순위).
 */
export async function GET(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const game = request.nextUrl.searchParams.get("game")
    if (!game || !GAMES.has(game)) {
      return apiBadRequest("알 수 없는 게임입니다.")
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc("get_minigame_daily_leaderboard", {
      p_game: game,
      p_limit: 10,
    })

    if (error) {
      console.error("[minigames/leaderboard] rpc failed:", error)
      return apiError("순위를 불러오지 못했습니다.", 500)
    }

    return NextResponse.json(
      { entries: data ?? [] },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } }
    )
  } catch (err) {
    console.error("[minigames/leaderboard] unexpected:", err)
    return apiError("순위를 불러오지 못했습니다.", 500)
  }
}
