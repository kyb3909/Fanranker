import { NextResponse } from "next/server"
import { apiError } from "@/lib/api-error"
import { getRoomWithSeats } from "@/lib/draft/rooms"

/**
 * GET /api/draft-rooms/[id]
 *
 * 방 + 좌석 상세. 익명도 호출 가능 (RLS 가 권한 제어).
 * 단, 클라이언트 RLS 통한 SELECT 와 별도로 여기는 service role 로 직접 조회 — caller 는
 * 서버 컴포넌트 또는 본인이 좌석 보유 중인 경우에만 사용.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const room = await getRoomWithSeats(id).catch(() => null)
    if (!room) return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 })
    return NextResponse.json({ room })
  } catch (e) {
    return apiError("방 조회 실패", 500, e)
  }
}
