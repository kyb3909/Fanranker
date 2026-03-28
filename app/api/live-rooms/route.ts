import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, checkRateLimit } from "@/lib/api-error"

/**
 * GET /api/live-rooms
 * 열린 채팅방 목록 (waiting, live, ended)
 * betman_games 정보 join
 */
export async function GET(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const supabase = createServiceRoleClient()

    // 1) 아직 live_room이 없는 오늘 '일반' 경기에 대해 자동 생성
    try {
      const now = new Date()
      const todayStart = new Date(now)
      todayStart.setHours(todayStart.getHours() - 8) // 여유 범위
      const tomorrowEnd = new Date(now)
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)

      // 오늘 일반 경기 조회
      const { data: todayGames } = await supabase
        .from("betman_games")
        .select("id, home_team_name, away_team_name, sport, match_time")
        .eq("game_type", "일반")
        .gte("match_time", todayStart.toISOString())
        .lt("match_time", tomorrowEnd.toISOString())
        .limit(200)

      // 이미 채팅방이 있는 game_id 조회
      const { data: existingRooms } = await supabase
        .from("live_rooms")
        .select("game_id")
        .not("game_id", "is", null)

      const existingGameIds = new Set((existingRooms ?? []).map((r) => r.game_id))
      const gamesWithoutRoom = (todayGames ?? []).filter((g) => !existingGameIds.has(g.id))

      // 같은 팀+같은 시간 경기 중복 제거 (betman에서 같은 경기가 여러 건 등록될 수 있음)
      const seenMatches = new Set<string>()
      const uniqueGames = gamesWithoutRoom.filter((g) => {
        const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
        if (seenMatches.has(key)) return false
        seenMatches.add(key)
        return true
      })

      if (uniqueGames && uniqueGames.length > 0) {
        const sportMap: Record<string, string> = {
          축구: "football",
          야구: "baseball",
          농구: "basketball",
          배구: "volleyball",
        }
        const roomRows = uniqueGames.map((g) => ({
          game_id: g.id,
          name: `${g.home_team_name} vs ${g.away_team_name}`,
          sport: sportMap[g.sport as string] || String(g.sport),
          status: "scheduled",
        }))
        // 일괄 insert (UNIQUE index on game_id가 중복 방지)
        try {
          await supabase.from("live_rooms").insert(roomRows)
        } catch {
          // unique constraint violation 등은 무시 (일부가 이미 존재할 수 있음)
        }
      }
    } catch {
      // 자동 생성 실패해도 목록 조회는 계속
    }

    // 2) 시작 시간이 지난 경기를 in_progress로 전환 (betman_games 상태 동기화)
    const now = new Date()
    await supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: now.toISOString() })
      .eq("status", "scheduled")
      .lt("match_time", now.toISOString())

    // 3) 경기 시간 기반 채팅방 상태 자동 전환 (scheduled→waiting→live→ended→closed)
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

    // 같은 매치(이름+시간) 중복 룸 제거 (먼저 생성된 것만 유지)
    const seenRoomKeys = new Set<string>()
    const dedupedRooms = (data ?? []).filter((r: any) => {
      const key = r.betman_games
        ? `${r.betman_games.home_team_name}_${r.betman_games.away_team_name}_${r.betman_games.match_time}`
        : r.id
      if (seenRoomKeys.has(key)) return false
      seenRoomKeys.add(key)
      return true
    })

    return NextResponse.json({ rooms: dedupedRooms })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
