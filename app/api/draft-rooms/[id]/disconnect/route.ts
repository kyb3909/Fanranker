import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * POST /api/draft-rooms/[id]/disconnect
 *
 * 본인 좌석의 disconnected_at 을 now() 로 설정.
 * Phase 3E cron 이 30초 지난 좌석을 AI 로 전환.
 * 페이지 unmount 또는 visibilitychange='hidden' 시 호출.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    const supabase = createServiceRoleClient()

    await supabase
      .from("draft_room_seats")
      .update({ disconnected_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .is("disconnected_at", null) // 이미 disconnected 면 timestamp 유지

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError("disconnect 실패", 500, e)
  }
}
