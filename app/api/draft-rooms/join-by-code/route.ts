import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { findRoomByInviteCode, joinRoom } from "@/lib/draft/rooms"

const Body = z.object({
  code: z
    .string()
    .min(4)
    .max(8)
    .transform((s) => s.toUpperCase().trim()),
})

/**
 * POST /api/draft-rooms/join-by-code
 *
 * invite_code 로 방 찾아서 합류. private 방도 코드로는 진입 가능.
 * Body: { code: string }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const body = await request.json().catch(() => ({}))
    const parsed = Body.safeParse(body)
    if (!parsed.success) return apiBadRequest("invalid code")

    const found = await findRoomByInviteCode(parsed.data.code)
    if (!found)
      return NextResponse.json({ error: "코드에 해당하는 방이 없습니다" }, { status: 404 })

    const displayName = await getDisplayName(user.id, user.firstName)
    if (!displayName) return apiBadRequest("profile not found")

    const room = await joinRoom({
      roomId: found.id,
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
