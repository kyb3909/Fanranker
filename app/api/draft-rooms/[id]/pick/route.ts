import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import {
  getRoomFullState,
  pickPlayer,
  pickRecommendation,
  PickError,
} from "@/lib/draft/multi-engine"

const Body = z.object({
  playerId: z.string().min(1),
})

const TimeoutBody = z.object({
  type: z.literal("timeout"),
})

/**
 * POST /api/draft-rooms/[id]/pick
 *
 * Body 형식 두 가지:
 * 1. { playerId: string } — 본인이 직접 픽
 * 2. { type: "timeout" } — pick_deadline 지난 timeout 요청.
 *    누구든 호출 가능 (현재 차례 본인이 끊겼을 때 다른 클라가 trigger).
 *    서버가 deadline 검증 + 추천 선수로 auto-pick.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    const body = await request.json().catch(() => ({}))

    // Timeout auto-pick path
    if (TimeoutBody.safeParse(body).success) {
      const state = await getRoomFullState(roomId)
      if (!state) {
        return NextResponse.json({ error: "방 없음" }, { status: 404 })
      }
      if (state.status !== "drafting") {
        return NextResponse.json({ error: "진행 중 아님" }, { status: 409 })
      }
      if (!state.pick_deadline_at) {
        return NextResponse.json({ error: "deadline 없음" }, { status: 409 })
      }
      const deadline = new Date(state.pick_deadline_at).getTime()
      if (Date.now() < deadline) {
        return NextResponse.json({ error: "아직 deadline 전입니다" }, { status: 409 })
      }
      const currentSeatIdx = state.snake_order?.[state.current_pick]
      if (currentSeatIdx === undefined) {
        return NextResponse.json({ error: "픽 인덱스 무효" }, { status: 409 })
      }
      const recommended = await pickRecommendation(state, currentSeatIdx)
      if (!recommended) {
        return NextResponse.json({ error: "추천 가능한 선수가 없습니다" }, { status: 409 })
      }
      const next = await pickPlayer({
        roomId,
        userId: null,
        playerId: recommended,
        isAutoPick: true,
      })
      return NextResponse.json({ room: next })
    }

    // 직접 픽 path
    const parsed = Body.safeParse(body)
    if (!parsed.success) return apiBadRequest("invalid body")

    const next = await pickPlayer({
      roomId,
      userId: user.id,
      playerId: parsed.data.playerId,
    })
    return NextResponse.json({ room: next })
  } catch (e) {
    if (e instanceof PickError) {
      const status =
        e.code === "not_your_turn" || e.code === "seat_ai"
          ? 403
          : e.code === "not_drafting" || e.code === "already_picked"
            ? 409
            : e.code === "over_budget" || e.code === "slot_full"
              ? 422
              : e.code === "not_found"
                ? 404
                : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    return apiError("픽 실패", 500, e)
  }
}
