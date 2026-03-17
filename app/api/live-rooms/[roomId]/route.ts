import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/live-rooms/[roomId]
 * 채팅방 상세 (경기 정보 포함)
 * 매 요청 시 라이브룸 상태 동기화 실행
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params
    const supabase = createServiceRoleClient()

    // 시간 기반 상태 전환 + 라이브룸 상태 동기화
    const now = new Date().toISOString()
    await supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: now })
      .eq("status", "scheduled")
      .lt("match_time", now)
    await Promise.resolve(supabase.rpc("sync_live_room_status")).catch(() => {})

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
          league_code,
          result,
          home_score,
          away_score
        )
      `
      )
      .eq("id", roomId)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "채팅방을 찾을 수 없습니다." }, { status: 404 })
      }
      return apiError("채팅방 조회 실패", 500, error)
    }

    return NextResponse.json({ room: data })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
