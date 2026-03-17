import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/live-rooms
 * 열린 채팅방 목록 (waiting, live, ended)
 * betman_games 정보 join
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from("live_rooms")
      .select(
        `
        id,
        name,
        sport,
        status,
        created_at,
        game_id,
        betman_games (
          id,
          home_team_name,
          away_team_name,
          match_time,
          status,
          sport,
          league_code
        )
      `
      )
      .in("status", ["waiting", "live", "ended"])
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      return apiError("채팅방 목록 조회 실패", 500, error)
    }

    return NextResponse.json({ rooms: data ?? [] })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
