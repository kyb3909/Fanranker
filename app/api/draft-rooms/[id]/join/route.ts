import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { joinRoom } from "@/lib/draft/rooms"

/**
 * POST /api/draft-rooms/[id]/join
 *
 * 방 합류 (좌석 점유). 이미 같은 사용자 좌석 있으면 idempotent.
 * 다른 active 방 있으면 자동 leave 후 합류.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params

    const displayName = await getDisplayName(user.id, user.firstName)
    if (!displayName) return apiBadRequest("profile not found")

    const room = await joinRoom({
      roomId,
      userId: user.id,
      displayName,
    })

    return NextResponse.json({ room })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "방 합류 실패"
    if (msg.includes("Room is full")) {
      return NextResponse.json({ error: "방이 가득 찼습니다" }, { status: 409 })
    }
    if (msg.includes("no longer accepting")) {
      return NextResponse.json({ error: "이미 시작되었거나 종료된 방입니다" }, { status: 409 })
    }
    return apiError("방 합류 실패", 500, e)
  }
}

async function getDisplayName(userId: string, firstName: string | null): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", userId)
    .maybeSingle<{ nickname: string | null }>()
  return data?.nickname ?? firstName ?? null
}
