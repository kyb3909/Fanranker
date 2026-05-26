import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { startRoom, StartRoomError } from "@/lib/draft/multi-engine"

/**
 * POST /api/draft-rooms/[id]/start
 *
 * 호스트가 게임 시작. 빈 좌석 AI fill + snake_order 셔플 + status='drafting'.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    const state = await startRoom(roomId, user.id)
    return NextResponse.json({ room: state })
  } catch (e) {
    if (e instanceof StartRoomError) {
      const status =
        e.code === "not_host"
          ? 403
          : e.code === "not_waiting"
            ? 409
            : e.code === "not_found"
              ? 404
              : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    return apiError("게임 시작 실패", 500, e)
  }
}
