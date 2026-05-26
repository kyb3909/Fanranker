import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"
import { getRoomFullState } from "@/lib/draft/multi-engine"

/**
 * GET /api/draft-rooms/[id]/full
 *
 * 방 + 좌석 + 픽 한 번에. 진행 화면이 변경 시 매번 호출.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const state = await getRoomFullState(id)
    if (!state) {
      return NextResponse.json({ error: "방 없음" }, { status: 404 })
    }
    return NextResponse.json({ state })
  } catch (e) {
    return apiError("상태 조회 실패", 500, e)
  }
}
