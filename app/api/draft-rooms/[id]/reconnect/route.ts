import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * POST /api/draft-rooms/[id]/reconnect
 *
 * 본인 좌석의 disconnected_at 클리어. 30초 이내 재접속 성공.
 * AI 로 전환된 좌석(is_ai=true)이라면 더 이상 복귀 불가 — 200 반환하되 회복 안 함.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    const supabase = createServiceRoleClient()

    await supabase
      .from("draft_room_seats")
      .update({ disconnected_at: null })
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .eq("is_ai", false)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError("reconnect 실패", 500, e)
  }
}
