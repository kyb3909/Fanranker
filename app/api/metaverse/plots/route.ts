import { NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"
import type { ChatRoomMeta, WorldPlot } from "@/lib/metaverse/types"

/**
 * GET /api/metaverse/plots
 * 활성 광장 Plot 전체 + 현재 열려있는 채팅방 (공개 읽기).
 *
 * RLS 정책이 is_active / closed_at 필터 걸려있어 anon 클라이언트로 충분.
 */
export async function GET() {
  const supabase = createAnonClient()

  const [plotsRes, roomsRes] = await Promise.all([
    supabase
      .from("metaverse_world_plots")
      .select("id, plot_code, plaza_name, pin_x, pin_y, width_units, height_units")
      .eq("is_active", true),
    supabase
      .from("metaverse_chat_rooms")
      .select("id, plot_id, owner_user_id, sign_text, created_at, last_activity_at")
      .is("closed_at", null),
  ])

  if (plotsRes.error) {
    return NextResponse.json({ error: "plots_load_failed" }, { status: 500 })
  }
  if (roomsRes.error) {
    return NextResponse.json({ error: "rooms_load_failed" }, { status: 500 })
  }

  const plots: WorldPlot[] = (plotsRes.data ?? []).map((row) => ({
    id: row.id,
    plotCode: row.plot_code,
    plazaName: row.plaza_name,
    pinX: Number(row.pin_x),
    pinY: Number(row.pin_y),
    widthUnits: row.width_units,
    heightUnits: row.height_units,
  }))

  const rooms: ChatRoomMeta[] = (roomsRes.data ?? []).map((row) => ({
    id: row.id,
    plotId: row.plot_id,
    ownerUserId: row.owner_user_id,
    signText: row.sign_text,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  }))

  return NextResponse.json({ plots, rooms })
}
