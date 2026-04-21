import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"
import { broadcastRoomCreated } from "@/lib/metaverse/realtime/server-broadcast"

const SIGN_TEXT_MAX = 20
const DEFAULT_COST = 100

/**
 * POST /api/metaverse/chat-rooms
 * 채팅방 개설. atomic RPC (metaverse_create_chat_room) 한 번 호출로:
 *   - 잔액 100점 차감
 *   - metaverse_chat_rooms INSERT
 * race condition 시 (동시 다른 유저 선점) 차감도 롤백됨.
 *
 * body: { plotId: string, signText: string, cost?: number (default 100) }
 */
export async function POST(req: Request) {
  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { plotId?: unknown; signText?: unknown; cost?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const plotId = typeof body.plotId === "string" ? body.plotId : ""
  const signText = typeof body.signText === "string" ? body.signText.trim() : ""
  const cost = typeof body.cost === "number" && body.cost > 0 ? body.cost : DEFAULT_COST

  if (!plotId) {
    return NextResponse.json({ error: "plot_id_required" }, { status: 400 })
  }
  if (!signText) {
    return NextResponse.json({ error: "sign_text_required" }, { status: 400 })
  }
  if (signText.length > SIGN_TEXT_MAX) {
    return NextResponse.json({ error: "sign_text_too_long" }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  const { data, error } = await admin.rpc("metaverse_create_chat_room", {
    p_user_id: me.userId,
    p_plot_id: plotId,
    p_sign_text: signText,
    p_cost: cost,
  })

  if (error) {
    console.error("[metaverse] create_chat_room rpc failed", error)
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 })
  }

  // RPC는 jsonb 를 반환 — 성공/실패 구분
  const result = data as {
    success: boolean
    error_message?: string
    room_id?: string
    new_balance?: number
  }

  if (!result?.success) {
    const reason = result?.error_message ?? "unknown"
    const status = reason === "insufficient_balance" || reason === "plot_occupied" ? 409 : 400
    return NextResponse.json({ error: reason }, { status })
  }

  // 방 세부 정보 조회 (프론트 Signboard 렌더용 전체 메타 반환)
  const { data: room } = await admin
    .from("metaverse_chat_rooms")
    .select("id, plot_id, owner_user_id, sign_text, created_at, last_activity_at")
    .eq("id", result.room_id!)
    .maybeSingle()

  const roomMeta = room
    ? {
        id: room.id,
        plotId: room.plot_id,
        ownerUserId: room.owner_user_id,
        signText: room.sign_text,
        createdAt: room.created_at,
        lastActivityAt: room.last_activity_at,
      }
    : undefined

  // 다른 접속자에게 실시간 알림 (best-effort)
  if (roomMeta) {
    void broadcastRoomCreated(roomMeta)
  }

  return NextResponse.json({
    success: true,
    newBalance: result.new_balance,
    room: roomMeta,
  })
}
