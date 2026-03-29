import { NextRequest, NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/** GET /api/battles/rooms?mode=cheer|worldcup&category=축구 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get("mode")
    const category = searchParams.get("category")

    if (!mode || !["cheer", "worldcup"].includes(mode)) {
      return apiBadRequest("mode 파라미터가 필요합니다 (cheer | worldcup)")
    }

    const supabase = createAnonClient()

    let query = supabase
      .from("battle_rooms")
      .select("*, battle_sides(*)")
      .eq("mode", mode)
      .in("status", ["pending", "upcoming", "active", "ended"])
      .order("created_at", { ascending: false })
      .limit(50)

    if (category && category !== "all") {
      query = query.eq("category", category)
    }

    const { data: rooms, error } = await query

    if (error) {
      console.error("[battles/rooms] DB error:", error)
      return apiError("배틀 목록을 불러올 수 없습니다", 500)
    }

    return NextResponse.json({ rooms: rooms ?? [] })
  } catch (err) {
    console.error("[battles/rooms] Unexpected error:", err)
    return apiError("서버 오류가 발생했습니다", 500)
  }
}
