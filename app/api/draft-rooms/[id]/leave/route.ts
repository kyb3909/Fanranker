import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { leaveRoom } from "@/lib/draft/rooms"

/**
 * POST /api/draft-rooms/[id]/leave
 *
 * 좌석 떠나기. 호스트면 자동 승계, 모두 떠나면 방 abandoned.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    await leaveRoom(roomId, user.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiError("방 이탈 실패", 500, e)
  }
}
