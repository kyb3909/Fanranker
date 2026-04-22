import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"
import { broadcastRoomClosed } from "@/lib/metaverse/realtime/server-broadcast"
import { checkRateLimit } from "@/lib/api-error"

/**
 * DELETE /api/metaverse/chat-rooms/[id]
 * 방장이 본인 방을 수동 close. 차감된 100P 는 반환하지 않음 (정책).
 * closed_at 을 채워 soft close — 실제 row는 남겨서 감사 가능.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = checkRateLimit(req, "STANDARD")
  if (limited) return limited

  const { id } = await params
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const admin = createServiceRoleClient()

  // owner + 아직 열려있는 방만 close
  const { data, error } = await admin
    .from("metaverse_chat_rooms")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_user_id", me.userId)
    .is("closed_at", null)
    .select("id, plot_id")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "close_failed", detail: error.message }, { status: 500 })
  }
  if (!data) {
    // 없거나, 본인 방이 아니거나, 이미 닫힌 방
    return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 })
  }

  // 다른 접속자에게 실시간 알림 (best-effort)
  void broadcastRoomClosed(data.plot_id)

  return NextResponse.json({ success: true, plotId: data.plot_id })
}
