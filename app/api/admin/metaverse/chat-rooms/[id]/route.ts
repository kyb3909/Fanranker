import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiUnauthorized } from "@/lib/api-error"
import { broadcastRoomClosed } from "@/lib/metaverse/realtime/server-broadcast"

/**
 * DELETE /api/admin/metaverse/chat-rooms/[id]
 * 관리자 전용 — 소유자와 무관하게 방을 즉시 soft-close 하고 broadcast.
 * 신고/부적절 간판/악의적 방 대응용.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return apiUnauthorized()

  const admin = createServiceRoleClient()

  // admin role 확인
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const { data, error } = await admin
    .from("metaverse_chat_rooms")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id)
    .is("closed_at", null)
    .select("id, plot_id, owner_user_id, sign_text")
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: "force_close_failed", detail: error.message },
      { status: 500 }
    )
  }
  if (!data) {
    return NextResponse.json({ error: "already_closed_or_not_found" }, { status: 404 })
  }

  // 접속자 전원 Signboard 즉시 제거
  void broadcastRoomClosed(data.plot_id)

  return NextResponse.json({
    success: true,
    closed: {
      id: data.id,
      plotId: data.plot_id,
      ownerUserId: data.owner_user_id,
      signText: data.sign_text,
    },
  })
}
