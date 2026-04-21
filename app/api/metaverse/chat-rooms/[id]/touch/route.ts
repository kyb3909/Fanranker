import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"

/**
 * POST /api/metaverse/chat-rooms/[id]/touch
 * 방 안에서 활동이 있을 때 last_activity_at 를 갱신 → 청소 크론 대상에서 제외.
 *
 * 모든 인증 유저 허용 (본인이 방 안에 있다는 증명은 안 하지만, 악용해도 방 수명만
 * 연장되므로 남용 영향 낮음). 과도 호출 방지는 클라이언트 쪽에서 throttle.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from("metaverse_chat_rooms")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", id)
    .is("closed_at", null)

  if (error) {
    return NextResponse.json({ error: "touch_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
