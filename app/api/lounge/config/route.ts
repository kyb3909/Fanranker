import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { METAVERSE } from "@/lib/metaverse/constants"
import { apiError } from "@/lib/api-error"

/**
 * GET /api/lounge/config
 *
 * 팬 라운지 방 구성 — 개설 가능한 방 수는 경기장 레벨에 연동.
 * 경기장 레벨을 올려야(기부) 라운지 방이 늘어나는 당위성 루프의 조회 지점.
 */
export async function GET() {
  try {
    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from("team_stadiums")
      .select("level")
      .eq("team_id", METAVERSE.LOUNGE_TEAM_ID)
      .maybeSingle()

    // 경기장 row 가 없어도 라운지는 최소 1개 방으로 동작
    const stadiumLevel = Math.max(1, Math.min(10, data?.level ?? 1))

    const res = NextResponse.json({
      teamId: METAVERSE.LOUNGE_TEAM_ID,
      stadiumLevel,
      channelCap: stadiumLevel, // 방 수 = 경기장 레벨 (Lv.1=1방 … Lv.10=10방)
      capacityPerChannel: METAVERSE.LOUNGE_ROOM_CAPACITY,
    })
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
    return res
  } catch (error) {
    return apiError("라운지 설정을 가져오는 중 오류가 발생했습니다.", 500, error)
  }
}
