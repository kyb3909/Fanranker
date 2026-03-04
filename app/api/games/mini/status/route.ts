import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/games/mini/status?game=penalty_kick
 *
 * 오늘 플레이 가능 여부 + 최근 기록 5개
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const gameType =
      request.nextUrl.searchParams.get("game") || "penalty_kick"

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    // KST 기준 오늘 날짜
    const now = new Date()
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const today = kstDate.toISOString().slice(0, 10) // YYYY-MM-DD

    // 오늘 플레이 기록 확인
    const { data: todayPlay } = await supabase
      .from("mini_game_plays")
      .select("id, goals, gold_rewarded, kick_details, created_at")
      .eq("user_id", user.id)
      .eq("game_type", gameType)
      .eq("play_date", today)
      .single()

    // 최근 기록 5개
    const { data: recentPlays } = await supabase
      .from("mini_game_plays")
      .select("play_date, goals, gold_rewarded, created_at")
      .eq("user_id", user.id)
      .eq("game_type", gameType)
      .order("play_date", { ascending: false })
      .limit(5)

    return NextResponse.json({
      canPlay: !todayPlay,
      todayResult: todayPlay || null,
      recentPlays: recentPlays || [],
      today,
    })
  } catch (error) {
    return apiError("게임 상태를 가져오는 중 오류가 발생했습니다.", 500, error)
  }
}
